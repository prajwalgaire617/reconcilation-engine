import os
import sys
import threading
import time
import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)

_scheduler_started = False  # module-level guard prevents double-start


class ReconciliationConfig(AppConfig):
    name = "reconciliation"
    verbose_name = "SSF Payment Reconciliation"

    def ready(self):
        global _scheduler_started
        if _scheduler_started:
            return

        # Skip in management commands that don't need background jobs
        skip_commands = {"migrate", "makemigrations", "collectstatic", "shell",
                         "check", "test", "dbshell", "showmigrations", "sqlmigrate"}
        if any(cmd in sys.argv for cmd in skip_commands):
            return

        # When Django autoreloader is active, it spawns TWO processes.
        # RUN_MAIN=true marks the child (real server). Skip the parent.
        if "runserver" in sys.argv and os.environ.get("RUN_MAIN") != "true":
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
        logger.info("[PaymentScheduler] Background thread started — polling every %ds", interval)


def _scheduler_loop(interval: int) -> None:
    # Short delay on startup to let Django finish initialising
    time.sleep(5)
    logger.info("[PaymentScheduler] First tick in %ds", interval)

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
