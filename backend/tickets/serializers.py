from rest_framework import serializers

from .models import Category, Comment, Ticket


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'ticket', 'author', 'author_name', 'body', 'created_at']
        read_only_fields = ['ticket', 'author', 'created_at']


class TicketSerializer(serializers.ModelSerializer):
    """List/create/update representation — FKs as plain ids."""

    class Meta:
        model = Ticket
        fields = [
            'id', 'title', 'description', 'requester_name', 'requester_email',
            'category', 'priority', 'status', 'assigned_to',
            'created_at', 'updated_at', 'resolved_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'resolved_at']


class TicketDetailSerializer(TicketSerializer):
    """Adds the comment thread for the ticket detail screen."""

    comments = CommentSerializer(many=True, read_only=True)

    class Meta(TicketSerializer.Meta):
        fields = TicketSerializer.Meta.fields + ['comments']


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


class StatsSerializer(serializers.Serializer):
    by_status = serializers.DictField(child=serializers.IntegerField())
    by_priority = serializers.DictField(child=serializers.IntegerField())
