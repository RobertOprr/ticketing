"""
Django settings for helpdesk_backend project.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Falls back to the old hardcoded dev values so local Docker Compose setup
# still works with zero config; set real env vars in production.
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-helpdesk-portfolio-key-change-in-prod')

DEBUG = os.environ.get('DJANGO_DEBUG', 'True') == 'True'

ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework.authtoken',
    'drf_spectacular',
    'tickets',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Empty by default — local dev goes through the Vite proxy (same-origin,
# no CORS needed). Set to the deployed frontend's URL in production.
CORS_ALLOWED_ORIGINS = [
    origin for origin in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if origin
]

ROOT_URLCONF = 'helpdesk_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'helpdesk_backend.wsgi.application'

# MySQL — defaults match docker-compose.yml for local dev; set the DB_*
# env vars in production to point at a real MySQL host. DB_SSL_CA is only
# set in production (e.g. Aiven requires SSL) — local Docker MySQL doesn't
# need it, so OPTIONS stays empty there.
DB_OPTIONS = {}
_db_ssl_ca = os.environ.get('DB_SSL_CA')
if _db_ssl_ca:
    DB_OPTIONS['ssl'] = {'ca': _db_ssl_ca}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.environ.get('DB_NAME', 'helpdesk'),
        'USER': os.environ.get('DB_USER', 'helpdesk'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'helpdesk'),
        'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
        'PORT': os.environ.get('DB_PORT', '3306'),
        'OPTIONS': DB_OPTIONS,
    }
}

AUTH_USER_MODEL = 'tickets.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # General abuse protection, plus a tighter scope on login specifically
    # (password brute-forcing is the realistic threat there).
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user': '1000/day',
        'anon': '100/day',
        'login': '10/minute',
    },
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Help Desk Ticketing API',
    'DESCRIPTION': 'Ticket lifecycle: creation, prioritization, status flow, assignment, escalation to L2, comments, SLA tracking.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
