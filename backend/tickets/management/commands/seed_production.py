import os

from django.core.management.base import BaseCommand

from tickets.models import Category, User

SPEC_CATEGORIES = ['Hardware', 'Software', 'Network', 'Account']


class Command(BaseCommand):
    """Idempotent — safe to run on every deploy (e.g. from the build command
    on hosts without shell access). Only acts on env vars that are set."""

    help = 'Create the initial superuser and seed spec categories from env vars'

    def handle(self, *args, **options):
        for name in SPEC_CATEGORIES:
            Category.objects.get_or_create(name=name)
        self.stdout.write(f'Categories ready: {", ".join(SPEC_CATEGORIES)}')

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
