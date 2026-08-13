"""Settings for the test suite — swaps MySQL for in-memory SQLite so tests
don't need extra MySQL grants and CI doesn't need a database service."""
from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}
