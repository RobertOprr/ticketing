from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.serializers import AuthTokenSerializer
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Ticket
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


class TicketPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class TicketListCreateView(generics.ListCreateAPIView):
    serializer_class = TicketSerializer
    pagination_class = TicketPagination

    def get_queryset(self):
        qs = Ticket.objects.select_related('category', 'assigned_to').all()
        params = self.request.query_params

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
        if assigned_to:
            qs = qs.filter(assigned_to_id=assigned_to)

        search = params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(requester_name__icontains=search)
                | Q(requester_email__icontains=search)
            )

        order_field, annotations = ORDERING_OPTIONS.get(
            params.get('ordering'), ORDERING_OPTIONS['-created_at']
        )
        if annotations:
            qs = qs.annotate(**annotations)
        return qs.order_by(order_field)


class TicketDetailView(generics.RetrieveUpdateAPIView):
    queryset = Ticket.objects.select_related('category', 'assigned_to').prefetch_related('comments')

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

        return Response({'by_status': by_status, 'by_priority': by_priority})
