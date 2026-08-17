import os

from django.core.management.base import BaseCommand

from tickets.models import CannedResponse, Category, User

SPEC_CATEGORIES = ['Hardware', 'Software', 'Network', 'Account']

DEFAULT_CANNED_RESPONSES = [
    (
        'Acknowledgement',
        "Thanks for reaching out — we've received your ticket and a member of our team will look into it shortly.",
    ),
    (
        'Requesting more info',
        'Could you share a few more details (screenshots, error messages, steps to reproduce) so we can look into this further?',
    ),
    (
        'Resolved',
        'This issue has been resolved. Please let us know if you continue to experience problems.',
    ),
    (
        'Escalated to L2',
        "We've escalated this ticket to our Tier 2 team for further investigation. We'll keep you updated.",
    ),
]


class Command(BaseCommand):
    """Idempotent — safe to run on every deploy (e.g. from the build command
    on hosts without shell access). Only acts on env vars that are set."""

    help = 'Create the initial superuser and seed spec categories from env vars'

    def handle(self, *args, **options):
        for name in SPEC_CATEGORIES:
            Category.objects.get_or_create(name=name)
        self.stdout.write(f'Categories ready: {", ".join(SPEC_CATEGORIES)}')

        for title, body in DEFAULT_CANNED_RESPONSES:
            CannedResponse.objects.get_or_create(title=title, defaults={'body': body})
        self.stdout.write(f'Canned responses ready: {len(DEFAULT_CANNED_RESPONSES)}')

        username = os.environ.get('DJANGO_SUPERUSER_USERNAME')
        password = os.environ.get('DJANGO_SUPERUSER_PASSWORD')
        if not username or not password:
            self.stdout.write('DJANGO_SUPERUSER_USERNAME/PASSWORD not set — skipping superuser.')
            return

        if User.objects.filter(username=username).exists():
            self.stdout.write(f'Superuser "{username}" already exists — skipping.')
            return

        User.objects.create_superuser(
            username=username,
            email=os.environ.get('DJANGO_SUPERUSER_EMAIL', f'{username}@example.com'),
            password=password,
            name=os.environ.get('DJANGO_SUPERUSER_NAME', username),
            role=User.Role.AGENT,
        )
        self.stdout.write(f'Created superuser "{username}".')
