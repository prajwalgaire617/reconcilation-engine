"""
Queue DTOs — contracts for the payment queue (FIFO scheduler).

EnqueueCommand      : input to add batches to the queue
QueueEntryDTO       : one entry in the payment queue
QueueListDTO        : full queue state
ExecuteQueueResultDTO: result of running due queue entries (from service or Celery task)
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import List, Optional


@dataclass(frozen=True)
class EnqueueCommand:
    """Input DTO: schedule batch IDs for execution at a specific time."""
    batch_ids: List[int]
    scheduled_at: datetime


@dataclass(frozen=True)
class QueueEntryDTO:
    """Output DTO: one item in the payment queue."""
    id: int
    position: int
    batch_id: int
    batch_number: str
    hospital_id: str
    hospital_name: str
    scheduled_at: datetime
    status: str                  # QUEUED | EXECUTING | COMPLETED | FAILED | CANCELLED
    executed_at: Optional[datetime]
    notes: str
    created_at: datetime
    claim_count: int = 0
    total_amount: Decimal = Decimal("0")


@dataclass(frozen=True)
class QueueListDTO:
    """Output DTO: full queue state."""
    entries: List[QueueEntryDTO]
    total_queued: int
    total_executing: int
    total_completed: int


@dataclass(frozen=True)
class ExecuteQueueResultDTO:
    """
    Output DTO: result of running due queue entries.

    Returned by QueueService.execute_due() and by the Celery execute_queue_task.
    The task stores this (serialised as dict) in the Celery result backend so
    operators can inspect what ran via Flower or the Django admin.
    """
    executed: int
    skipped: int
    failed: int
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "executed": self.executed,
            "skipped":  self.skipped,
            "failed":   self.failed,
            "errors":   self.errors,
        }
