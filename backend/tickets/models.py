from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Agent/L2 user. Extends Django's built-in auth user (keeps username +
    password handling) and adds the fields the spec calls for."""

    class Role(models.TextChoices):
        AGENT = 'agent', 'Agent'
        L2 = 'l2', 'L2'

    name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.AGENT)

    def __str__(self):
        return self.name or self.username


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class CannedResponse(models.Model):
    title = models.CharField(max_length=100)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return self.title


class Ticket(models.Model):
    class Priority(models.TextChoices):
        LOW = 'Low', 'Low'
        MEDIUM = 'Medium', 'Medium'
        HIGH = 'High', 'High'
        URGENT = 'Urgent', 'Urgent'

    class Status(models.TextChoices):
        OPEN = 'Open', 'Open'
        IN_PROGRESS = 'In Progress', 'In Progress'
        RESOLVED = 'Resolved', 'Resolved'
        ESCALATED = 'Escalated', 'Escalated'

    title = models.CharField(max_length=200)
    description = models.TextField()
    requester_name = models.CharField(max_length=150)
    requester_email = models.EmailField()
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='tickets')
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    assigned_to = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tickets'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    # Set once, by the requester, via the public portal — never by an agent.
    satisfaction_rating = models.PositiveSmallIntegerField(null=True, blank=True)

    def __str__(self):
        return f'#{self.id} {self.title}'


class Comment(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'Comment #{self.id} on ticket #{self.ticket_id}'


class TicketActivity(models.Model):
    """Auto-recorded audit trail entry — status/priority/assignment changes
    and escalations, distinct from Comment which is agent-authored text."""

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='activity')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='ticket_activity')
    description = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name_plural = 'Ticket activity'

    def __str__(self):
        return self.description
