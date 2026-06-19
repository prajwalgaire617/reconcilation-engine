"""
Django management command: run_payment_scheduler

Polls the payment queue every N seconds and executes batches whose
scheduled_at time has arrived. Runs until killed (Ctrl-C).

Usage:
    python manage.py run_payment_scheduler
    python manage.py run_payment_scheduler --interval 30
"""
import time
import logging
from django.core.management.base import BaseCommand
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Continuously execute due payment queue entries (FIFO scheduler)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=int,
            default=60,
            help="Polling interval in seconds (default: 60)",
        )
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run execute_due once then exit (useful for cron jobs)",
        )

    def handle(self, *args, **options):
        interval = options["interval"]
        once     = options["once"]

        self.stdout.write(self.style.SUCCESS(
            f"[PaymentScheduler] Starting — polling every {interval}s. Press Ctrl-C to stop."
        ))

        from reconciliation.services.queue_service import QueueService
        svc = QueueService()

        def tick():
            now = timezone.now()
            result = svc.execute_due()
            if result.executed or result.skipped:
                self.stdout.write(
                    f"[{now:%H:%M:%S}] Executed={result.executed}  Skipped={result.skipped}  "
                    f"Errors={len(result.errors)}"
                )
                for err in result.errors:
                    self.stdout.write(self.style.WARNING(f"  ⚠ {err}"))
            else:
                self.stdout.write(f"[{now:%H:%M:%S}] No due batches.")

        if once:
            tick()
            return

        try:
            while True:
                tick()
                time.sleep(interval)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("\n[PaymentScheduler] Stopped."))
