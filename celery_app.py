"""
Celery application entry point.

Why Celery instead of the daemon thread in apps.py?
----------------------------------------------------
The daemon thread (threading.Thread in ReconciliationConfig.ready()) has these problems:

1. NO RETRY LOGIC
   If a gateway call fails, the task silently dies. You have no way to
   automatically retry it or know it failed without parsing logs.
   Celery: @task(max_retries=3, default_retry_delay=60)

2. NO VISIBILITY
   You cannot see "what ran, when, and with what result" without parsing logs.
   Celery: Flower dashboard shows every task — start time, end time, args, result, traceback.

3. NOT FAULT-TOLERANT
   If Django restarts (deployment, crash), the thread dies mid-execution.
   Celery: tasks are durable. The message sits in Redis/RabbitMQ until a worker picks it up.

4. SINGLE PROCESS ONLY
   One Django process = one scheduler. Under Gunicorn with 4 workers, 4 scheduler
   threads all run simultaneously, causing duplicate payment execution.
   Celery Beat: exactly one scheduler process, separate from web workers.

5. BLOCKING
   If a NCHL gateway call takes 30s, the scheduler thread is blocked.
   Subsequent due entries wait. Under Django's dev server (single thread),
   this blocks the entire web process.
   Celery: tasks run in worker processes, completely isolated from web traffic.

6. NO RATE LIMITING
   Can't control how many gateway calls run concurrently.
   Celery: task_annotations = {'reconciliation.tasks.*': {'rate_limit': '10/m'}}

Setup:
  1. Install:   pip install celery[redis] django-celery-results celery[beat]
  2. Run Redis: docker run -d -p 6379:6379 redis:7-alpine
  3. Worker:    celery -A celery_app worker -l info
  4. Beat:      celery -A celery_app beat -l info
  5. Monitor:   celery -A celery_app flower
"""
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")

app = Celery("reconciliation")

# Read config from Django settings with CELERY_ prefix
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks from all INSTALLED_APPS
app.autodiscover_tasks()

# ── Scheduled tasks (replaces the daemon thread + management command cron) ────

app.conf.beat_schedule = {
    # Execute any due payment queue entries every 60 seconds
    "execute-payment-queue": {
        "task": "reconciliation.tasks.payment_tasks.execute_queue_task",
        "schedule": 60.0,   # seconds
        "options": {"expires": 55},  # skip if previous run hasn't finished
    },
    # Nightly FHIR sync at 01:00 Asia/Kathmandu
    "nightly-fhir-sync": {
        "task": "reconciliation.tasks.sync_tasks.fhir_sync_task",
        "schedule": crontab(hour=1, minute=0),
        "args": (3,),  # months=3
    },
}

app.conf.timezone = "Asia/Kathmandu"
