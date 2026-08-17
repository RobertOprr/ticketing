from rest_framework import serializers

from .models import CannedResponse, Category, Comment, Ticket, TicketActivity


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class CannedResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = CannedResponse
        fields = ['id', 'title', 'body', 'created_at']
        read_only_fields = ['created_at']


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'ticket', 'author', 'author_name', 'body', 'created_at']
        read_only_fields = ['ticket', 'author', 'created_at']


class TicketActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.name', default=None, read_only=True)

    class Meta:
        model = TicketActivity
        fields = ['id', 'actor_name', 'description', 'created_at']


class TicketSerializer(serializers.ModelSerializer):
    """List/create/update representation — FKs as plain ids."""

    class Meta:
        model = Ticket
        fields = [
            'id', 'title', 'description', 'requester_name', 'requester_email',
            'category', 'priority', 'status', 'assigned_to',
            'created_at', 'updated_at', 'resolved_at', 'satisfaction_rating',
        ]
        # satisfaction_rating is agent-read-only — only the public portal's
        # rate endpoint (which writes the model directly, bypassing this
        # serializer) can set it.
        read_only_fields = ['id', 'created_at', 'updated_at', 'resolved_at', 'satisfaction_rating']


class TicketDetailSerializer(TicketSerializer):
    """Adds the comment thread and other tickets from the same requester —
    an agent can spot a pattern (e.g. the same person filing repeat
    printer tickets) without searching for it manually."""

    comments = CommentSerializer(many=True, read_only=True)
    activity = TicketActivitySerializer(many=True, read_only=True)
    related_tickets = serializers.SerializerMethodField()

    class Meta(TicketSerializer.Meta):
        fields = TicketSerializer.Meta.fields + ['comments', 'activity', 'related_tickets']

    def get_related_tickets(self, ticket):
        related = (
            Ticket.objects.filter(requester_email=ticket.requester_email)
            .exclude(id=ticket.id)
            .order_by('-created_at')[:5]
        )
        return TicketSerializer(related, many=True).data


class PortalTicketSerializer(serializers.ModelSerializer):
    """Read-only, no-login view of a ticket for the requester — omits
    assigned_to (which agent is internal, not the customer's business) and
    any other agent-facing fields."""

    comments = CommentSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Ticket
        fields = [
            'id', 'title', 'description', 'status', 'priority', 'category_name',
            'created_at', 'updated_at', 'resolved_at', 'comments', 'satisfaction_rating',
        ]


# Response-shape-only serializers for plain APIViews that don't map to a
# model — exist purely so drf-spectacular can document their output.
class LoginUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.CharField()


class LoginResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = LoginUserSerializer()


class AgentResolvedCountSerializer(serializers.Serializer):
    agent_id = serializers.IntegerField()
    agent_name = serializers.CharField()
    resolved_count = serializers.IntegerField()


class NeedsAttentionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    priority = serializers.CharField()
    status = serializers.CharField()
    requester_name = serializers.CharField()
    age_hours = serializers.FloatField()
    sla_fraction = serializers.FloatField()
    hours_over_sla = serializers.FloatField()


class AgentLoadSerializer(serializers.Serializer):
    agent_id = serializers.IntegerField()
    agent_name = serializers.CharField()
    open_count = serializers.IntegerField()


class StatsSerializer(serializers.Serializer):
    by_status = serializers.DictField(child=serializers.IntegerField())
    by_priority = serializers.DictField(child=serializers.IntegerField())
    overdue_count = serializers.IntegerField()
    avg_resolution_hours = serializers.FloatField(allow_null=True)
    sla_achievement_rate = serializers.FloatField(allow_null=True)
    avg_satisfaction_rating = serializers.FloatField(allow_null=True)
    tickets_by_agent = AgentResolvedCountSerializer(many=True)
    tickets_per_hour = serializers.ListField(child=serializers.IntegerField())
    needs_attention = NeedsAttentionSerializer(many=True)
    total_open = serializers.IntegerField()
    agent_load = AgentLoadSerializer(many=True)
    unassigned_open_count = serializers.IntegerField()
