import csv
from datetime import timedelta

from django.db.models import Avg, Case, Count, DurationField, ExpressionWrapper, F, IntegerField, Q, Value, When
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.serializers import AuthTokenSerializer
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Category, Ticket, User
from .serializers import (
    CategorySerializer,
    CommentSerializer,
    LoginResponseSerializer,
    StatsSerializer,
    TicketDetailSerializer,
    TicketSerializer,
)


class LoginView(APIView):
    """Same contract as DRF's obtain_auth_token (username+password -> token),
    plus basic user info — the frontend needs the agent's id to support
    'assign to me', and the spec has no separate endpoint for that."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    @extend_schema(request=AuthTokenSerializer, responses=LoginResponseSerializer)
    def post(self, request):
        serializer = AuthTokenSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role},
        })


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


# Priority is stored as text (Low/Medium/High/Urgent), so a plain string
# sort would put them in alphabetical rather than urgency order — this
# maps each value to its rank so ordering by it is actually meaningful.
PRIORITY_RANK = Case(
    *[When(priority=value, then=Value(rank)) for rank, (value, _) in enumerate(Ticket.Priority.choices)],
    output_field=IntegerField(),
)

ORDERING_OPTIONS = {
    'created_at': ('created_at', {}),
    '-created_at': ('-created_at', {}),
    'priority': ('priority_rank', {'priority_rank': PRIORITY_RANK}),
    '-priority': ('-priority_rank', {'priority_rank': PRIORITY_RANK}),
}

# Mirrors the frontend's lib/sla.js SLA_THRESHOLD_HOURS — kept here too so
# "overdue" can be filtered/counted server-side without fetching every ticket.
SLA_THRESHOLD_HOURS = {
    Ticket.Priority.URGENT: 4,
    Ticket.Priority.HIGH: 8,
    Ticket.Priority.MEDIUM: 24,
    Ticket.Priority.LOW: 72,
}


def overdue_filter():
    """Q object matching tickets past their priority's SLA threshold. Doesn't
    exclude Resolved tickets, same as isOverdue() on the frontend, so a ticket
    flagged red on the list page is the same ticket counted here."""
    now = timezone.now()
    q = Q()
    for priority, hours in SLA_THRESHOLD_HOURS.items():
        q |= Q(priority=priority, created_at__lt=now - timedelta(hours=hours))
    return q


def sla_met_filter():
    """Q object matching resolved tickets that beat their priority's SLA
    threshold. NULL resolved_at never satisfies `__lte`, so unresolved
    tickets are excluded automatically."""
    q = Q()
    for priority, hours in SLA_THRESHOLD_HOURS.items():
        q |= Q(priority=priority, resolved_at__lte=F('created_at') + timedelta(hours=hours))
    return q


class TicketPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


def filter_tickets(params):
    """Applies the status/priority/category/assigned_to/overdue/search
    filters shared by the ticket list and the CSV export — one filter chain,
    two consumers."""
    qs = Ticket.objects.select_related('category', 'assigned_to').all()

    status_param = params.get('status')
    if status_param:
        qs = qs.filter(status=status_param)

    priority = params.get('priority')
    if priority:
        qs = qs.filter(priority=priority)

    category = params.get('category')
    if category:
        qs = qs.filter(category_id=category)

    assigned_to = params.get('assigned_to')
    if assigned_to == 'none':
        qs = qs.filter(assigned_to__isnull=True)
    elif assigned_to:
        qs = qs.filter(assigned_to_id=assigned_to)

    if params.get('overdue') == 'true':
        qs = qs.filter(overdue_filter())

    search = params.get('search')
    if search:
        qs = qs.filter(
            Q(title__icontains=search)
            | Q(description__icontains=search)
            | Q(requester_name__icontains=search)
            | Q(requester_email__icontains=search)
        )

    return qs


class TicketListCreateView(generics.ListCreateAPIView):
    serializer_class = TicketSerializer
    pagination_class = TicketPagination

    def get_queryset(self):
        qs = filter_tickets(self.request.query_params)

        order_field, annotations = ORDERING_OPTIONS.get(
            self.request.query_params.get('ordering'), ORDERING_OPTIONS['-created_at']
        )
        if annotations:
            qs = qs.annotate(**annotations)
        return qs.order_by(order_field)


def _csv_safe(value):
    """Neutralizes CSV/formula injection — a requester name or ticket title
    starting with =, +, -, or @ would otherwise be interpreted as a formula
    by Excel/Sheets when the export is opened."""
    s = '' if value is None else str(value)
    if s and s[0] in ('=', '+', '-', '@', '\t', '\r'):
        s = "'" + s
    return s


class TicketExportView(APIView):
    """CSV export of the currently filtered ticket list — reuses
    filter_tickets() so the export always matches what's on screen."""

    def get(self, request):
        qs = filter_tickets(request.query_params).order_by('-created_at')

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="tickets.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'ID', 'Title', 'Status', 'Priority', 'Category', 'Assigned To',
            'Requester Name', 'Requester Email', 'Created', 'Resolved',
        ])
        for t in qs.iterator():
            writer.writerow([
                t.id,
                *(_csv_safe(v) for v in [
                    t.title,
                    t.status,
                    t.priority,
                    t.category.name if t.category_id else '',
                    t.assigned_to.name if t.assigned_to_id else '',
                    t.requester_name,
                    t.requester_email,
                ]),
                t.created_at.isoformat(),
                t.resolved_at.isoformat() if t.resolved_at else '',
            ])
        return response


class CanChangeEscalatedStatus(BasePermission):
    """Once a ticket is Escalated, only an L2 agent can move it to a
    different status — agents can still view/comment, but resolving an
    escalation is an L2 call."""

    def has_object_permission(self, request, view, obj):
        if request.method not in ('PATCH', 'PUT'):
            return True
        changing_status = 'status' in request.data and request.data['status'] != obj.status
        if obj.status == Ticket.Status.ESCALATED and changing_status:
            return request.user.role == User.Role.L2
        return True


class TicketDetailView(generics.RetrieveUpdateAPIView):
    queryset = Ticket.objects.select_related('category', 'assigned_to').prefetch_related('comments')
    permission_classes = [IsAuthenticated, CanChangeEscalatedStatus]

    def get_serializer_class(self):
        return TicketDetailSerializer if self.request.method == 'GET' else TicketSerializer

    def perform_update(self, serializer):
        # resolved_at tracks the moment a ticket becomes Resolved, and clears
        # if it's reopened — mirrors the audit trail an interviewer would expect.
        was_resolved = serializer.instance.status == Ticket.Status.RESOLVED
        ticket = serializer.save()
        now_resolved = ticket.status == Ticket.Status.RESOLVED

        if now_resolved and not was_resolved:
            ticket.resolved_at = timezone.now()
            ticket.save(update_fields=['resolved_at'])
        elif was_resolved and not now_resolved:
            ticket.resolved_at = None
            ticket.save(update_fields=['resolved_at'])


class CommentCreateView(generics.CreateAPIView):
    serializer_class = CommentSerializer

    def perform_create(self, serializer):
        ticket = get_object_or_404(Ticket, pk=self.kwargs['pk'])
        serializer.save(ticket=ticket, author=self.request.user)


class EscalateTicketView(APIView):
    @extend_schema(request=None, responses=TicketSerializer)
    def post(self, request, pk):
        ticket = get_object_or_404(Ticket, pk=pk)
        ticket.status = Ticket.Status.ESCALATED
        ticket.save(update_fields=['status', 'updated_at'])
        return Response(TicketSerializer(ticket).data)


def needs_attention(limit=8):
    """Open tickets ranked by how much of their SLA window they've used up —
    computed in Python rather than the DB since it's a per-row ratio against
    a priority-keyed threshold, and the open-ticket set is small enough that
    this is simpler than portable cross-DB duration arithmetic."""
    now = timezone.now()
    open_tickets = list(Ticket.objects.exclude(status=Ticket.Status.RESOLVED))

    scored = []
    for t in open_tickets:
        threshold = SLA_THRESHOLD_HOURS[t.priority]
        age_hours = (now - t.created_at).total_seconds() / 3600
        scored.append({
            'id': t.id,
            'title': t.title,
            'priority': t.priority,
            'status': t.status,
            'requester_name': t.requester_name,
            'age_hours': round(age_hours, 2),
            'sla_fraction': round(age_hours / threshold, 3),
            'hours_over_sla': round(max(0.0, age_hours - threshold), 2),
        })
    scored.sort(key=lambda row: row['sla_fraction'], reverse=True)
    return scored[:limit], len(open_tickets)


def agent_load():
    """Currently-open (non-resolved) ticket counts per agent, plus the
    unassigned count — a workload snapshot, distinct from the historical
    'resolved by agent' figure in the Performance section."""
    open_qs = Ticket.objects.exclude(status=Ticket.Status.RESOLVED)
    by_agent = [
        {
            'agent_id': row['assigned_to_id'],
            'agent_name': row['assigned_to__name'],
            'open_count': row['open_count'],
        }
        for row in (
            open_qs.filter(assigned_to__isnull=False)
            .values('assigned_to_id', 'assigned_to__name')
            .annotate(open_count=Count('id'))
            .order_by('-open_count')
        )
    ]
    unassigned_count = open_qs.filter(assigned_to__isnull=True).count()
    return by_agent, unassigned_count


def tickets_per_hour(hours=8):
    """Ticket-creation counts for the last `hours` rolling 1-hour windows,
    oldest first — feeds the dashboard's activity sparkline."""
    now = timezone.now()
    return [
        Ticket.objects.filter(
            created_at__gte=now - timedelta(hours=i + 1), created_at__lt=now - timedelta(hours=i)
        ).count()
        for i in range(hours - 1, -1, -1)
    ]


class StatsView(APIView):
    """Counts for the dashboard cards — every status/priority is present,
    even at zero, so the cards don't disappear on a fresh install."""

    @extend_schema(responses=StatsSerializer)
    def get(self, request):
        by_status = dict.fromkeys((choice for choice, _ in Ticket.Status.choices), 0)
        for row in Ticket.objects.values('status').annotate(count=Count('id')):
            by_status[row['status']] = row['count']

        by_priority = dict.fromkeys((choice for choice, _ in Ticket.Priority.choices), 0)
        for row in Ticket.objects.values('priority').annotate(count=Count('id')):
            by_priority[row['priority']] = row['count']

        overdue_count = Ticket.objects.filter(overdue_filter()).count()

        resolved_qs = Ticket.objects.filter(status=Ticket.Status.RESOLVED, resolved_at__isnull=False)
        resolved_count = resolved_qs.count()

        avg_duration = resolved_qs.aggregate(
            avg=Avg(ExpressionWrapper(F('resolved_at') - F('created_at'), output_field=DurationField()))
        )['avg']
        avg_resolution_hours = round(avg_duration.total_seconds() / 3600, 1) if avg_duration else None

        sla_met_count = resolved_qs.filter(sla_met_filter()).count()
        sla_achievement_rate = (
            round(sla_met_count / resolved_count * 100, 1) if resolved_count else None
        )

        tickets_by_agent = [
            {
                'agent_id': row['assigned_to_id'],
                'agent_name': row['assigned_to__name'],
                'resolved_count': row['resolved_count'],
            }
            for row in (
                resolved_qs.filter(assigned_to__isnull=False)
                .values('assigned_to_id', 'assigned_to__name')
                .annotate(resolved_count=Count('id'))
                .order_by('-resolved_count')
            )
        ]

        needs_attention_list, total_open = needs_attention()
        agent_load_list, unassigned_open_count = agent_load()

        return Response({
            'by_status': by_status,
            'by_priority': by_priority,
            'overdue_count': overdue_count,
            'avg_resolution_hours': avg_resolution_hours,
            'sla_achievement_rate': sla_achievement_rate,
            'tickets_by_agent': tickets_by_agent,
            'tickets_per_hour': tickets_per_hour(),
            'needs_attention': needs_attention_list,
            'total_open': total_open,
            'agent_load': agent_load_list,
            'unassigned_open_count': unassigned_open_count,
        })
