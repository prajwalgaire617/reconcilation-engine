"""
ReconciliationConfig — Django AppConfig.

Scheduler strategy (two modes):

MODE 1 — Celery (production / recommended):
  Set CELERY_ALWAYS_EAGER=false in environment. Celery Beat fires
  execute_queue_task every 60 seconds. No daemon thread is started here.

  Advantages over the daemon thread:
    - Survives Django restarts (task in Redis broker queue)
    - Visible in Flower dashboard (task history, errors, retries)
    - Runs in dedicated worker process (never blocks web requests)
    - Automatic retry on gateway failure
    - Celery Beat ensures exactly-once scheduling even with N web workers

  Start with:
    celery -A celery_app worker -l info
    celery -A celery_app beat -l info

MODE 2 — Daemon thread (development / no Redis):
  When CELERY_ALWAYS_EAGER=true (the default in settings.py), Celery tasks
  run synchronously in the web process. The daemon thread is kept as a fallback
  scheduler so the queue still executes during local development without Redis.

  The thread starts only when:
    - CELERY_ALWAYS_EAGER=true (eager mode, no real Celery worker)
    - Not running a management command
    - Running under the Django autoreloader's real child process (RUN_MAIN=true)
"""
import os
import sys
import threading
import time
import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)

_scheduler_started = False


class ReconciliationConfig(AppConfig):
    name = "reconciliation"
    verbose_name = "SSF Payment Reconciliation"

    def ready(self):
        global _scheduler_started
        if _scheduler_started:
            return

        skip_commands = {
            "migrate", "makemigrations", "collectstatic", "shell",
            "check", "test", "dbshell", "showmigrations", "sqlmigrate",
        }
        if any(cmd in sys.argv for cmd in skip_commands):
            return

        if "runserver" in sys.argv and os.environ.get("RUN_MAIN") != "true":
            return

        # If Celery is running in real mode (not eager), don't start the thread —
        # Celery Beat handles scheduling.
        celery_eager = os.environ.get("CELERY_ALWAYS_EAGER", "true").lower() == "true"
        if not celery_eager:
            logger.info(
                "[ReconciliationConfig] Celery mode active — "
                "daemon thread NOT started. Use `celery -A celery_app worker` + beat."
            )
            return

        _scheduler_started = True
        interval = int(os.environ.get("PAYMENT_SCHEDULER_INTERVAL", "60"))

        t = threading.Thread(
            target=_scheduler_loop,
            args=(interval,),
            daemon=True,
            name="PaymentScheduler",
        )
        t.start()
        logger.info(
            "[PaymentScheduler] Fallback daemon thread started (Celery eager mode) — "
            "polling every %ds. Set CELERY_ALWAYS_EAGER=false + start a Celery worker for production.",
            interval,
        )


def _scheduler_loop(interval: int) -> None:
    time.sleep(5)  # let Django finish initialising
    while True:
        try:
            from reconciliation.services.queue_service import QueueService
            result = QueueService().execute_due()
            if result.executed:
                logger.info(
                    "[PaymentScheduler] Executed=%d Skipped=%d Errors=%d",
                    result.executed, result.skipped, len(result.errors),
                )
                for err in result.errors:
                    logger.warning("[PaymentScheduler] %s", err)
            elif result.skipped:
                logger.debug("[PaymentScheduler] %d due items skipped (errors)", result.skipped)
        except Exception as exc:
            logger.exception("[PaymentScheduler] Unexpected error: %s", exc)
        time.sleep(interval)
