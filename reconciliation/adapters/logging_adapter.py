"""
Structured logging adapter — Factory + Single Responsibility.
Provides domain-level audit logging separate from Python's stdlib logging.
"""
import logging
from django.utils import timezone
from .base import ReconciliationLogPort, BatchSubmitResult


class DjangoStructuredLogger(ReconciliationLogPort):
    """Writes structured reconciliation events to Django's logging system."""

    def __init__(self, name: str = "reconciliation.audit"):
        self._log = logging.getLogger(name)

    def log_batch_submitted(self, batch_number: str, item_count: int, result: BatchSubmitResult) -> None:
        self._log.info(
            "[AUDIT] batch_submitted | batch=%s | items=%d | gateway_batch=%s | status=%s | "
            "success=%d | at=%s",
            batch_number, item_count, result.gateway_batch_id, result.overall_status,
            sum(1 for r in result.results if r.status == "SUCCESS"),
            timezone.now().isoformat(),
        )

    def log_reconciliation_complete(self, batch_number: str, matched: int, pending: int, errors: int) -> None:
        self._log.info(
            "[AUDIT] reconciliation_complete | batch=%s | matched=%d | pending=%d | errors=%d | at=%s",
            batch_number, matched, pending, errors, timezone.now().isoformat(),
        )

    def log_error(self, context: str, error: Exception) -> None:
        self._log.error(
            "[AUDIT] error | context=%s | error=%s | at=%s",
            context, str(error), timezone.now().isoformat(),
        )


class LoggerFactory:
    """
    Factory for creating logger instances.
    Open/Closed: add new logger types without changing callers.
    """
    _instances: dict = {}

    @classmethod
    def get(cls, logger_type: str = "django") -> ReconciliationLogPort:
        if logger_type not in cls._instances:
            if logger_type == "django":
                cls._instances[logger_type] = DjangoStructuredLogger()
            else:
                raise ValueError(f"Unknown logger type: {logger_type!r}")
        return cls._instances[logger_type]
