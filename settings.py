from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

SECRET_KEY = "hackathon-demo-secret-not-for-production"
DEBUG = True
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "reconciliation",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

CORS_ALLOW_ALL_ORIGINS = True

ROOT_URLCONF = "urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# External service URLs
NCHL_GATEWAY_URL = "http://localhost:8001"
SOSYS_URL        = "http://localhost:8001"
SOSYS_TIMEOUT    = 5

# ── Celery configuration ──────────────────────────────────────────────────────
#
# Broker: Redis (required in production)
#   docker run -d -p 6379:6379 redis:7-alpine
#
# Fallback for dev without Redis:
#   Set CELERY_TASK_ALWAYS_EAGER=True to run tasks synchronously in the same process.
#   This makes Celery transparent during development — no broker needed.
#   WARNING: eager mode disables retries and concurrency. Never use in production.
#
# Install: pip install "celery[redis]" django-celery-results "celery[beat]"
# Worker:  celery -A celery_app worker -l info -Q default
# Beat:    celery -A celery_app beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
# Flower:  celery -A celery_app flower --port=5555

import os

CELERY_BROKER_URL         = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND     = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT     = ["json"]
CELERY_TASK_SERIALIZER    = "json"
CELERY_RESULT_SERIALIZER  = "json"
CELERY_TIMEZONE           = "Asia/Kathmandu"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE     = True

# Dev fallback: run tasks in-process (no Redis needed)
# Override with environment variable: CELERY_ALWAYS_EAGER=false to disable
_always_eager = os.environ.get("CELERY_ALWAYS_EAGER", "true").lower() == "true"
CELERY_TASK_ALWAYS_EAGER  = _always_eager
CELERY_TASK_EAGER_PROPAGATES = True  # propagate exceptions in eager mode

# ── Payment gateway adapter selection ────────────────────────────────────────
PAYMENT_GATEWAY_TYPE    = os.environ.get("PAYMENT_GATEWAY_TYPE", "NCHL_MOCK")
CONFIRMATION_SYSTEM_TYPE = os.environ.get("CONFIRMATION_SYSTEM_TYPE", "SOSYS")
