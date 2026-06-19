"""
Operations Center DTOs — contracts for the enterprise ops dashboard.

ActionItemDTO   : one claim in the action queue (needs human attention)
ActivityEventDTO: one event in the 48-hour activity feed
OpsSummaryDTO   : aggregate metrics for the Operations Center metric strip
OpsActivityDTO  : list of recent activity events
ExceptionItemDTO: one reconciliation exception with severity
ExceptionListDTO: paginated exception list with summary counts
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional


@dataclass(frozen=True)
class ActionItemDTO:
    """One claim in the action queue requiring human attention."""
    claim_id: int
    patient_name: str
    hospital_name: str
    amount: Decimal
    status: str          # the recon result: STATUS_MISMATCH | INVESTIGATION_REQUIRED | ...
    reason: str
    priority: str        # CRITICAL | HIGH | MEDIUM | LOW
    detected_at: datetime


@dataclass(frozen=True)
class ActivityEventDTO:
    """One event in the ops activity feed."""
    type: str            # BATCH_SUBMITTED | CLAIM_RECONCILED | MISMATCH_DETECTED | ...
    ts: datetime
    description: str
    ref: str             # batch number or claim ID for reference
    severity: str        # info | warning | error


@dataclass(frozen=True)
class OpsSummaryDTO:
    """Aggregate metrics for the Operations Center header strip."""
    total_reconciled: int
    amount_settled_today: Decimal
    pending_settlement: Decimal
    failed_payments: int
    review_required: int
    money_at_risk: Decimal           # amounts with STATUS_MISMATCH + INVESTIGATION_REQUIRED
    unreconciled_amount: Decimal     # submitted to NCHL but no SOSYS match yet
    batches_today: int
    action_queue: List[ActionItemDTO] = field(default_factory=list)


@dataclass(frozen=True)
class OpsActivityDTO:
    """List of recent ops events."""
    events: List[ActivityEventDTO] = field(default_factory=list)


@dataclass(frozen=True)
class ExceptionItemDTO:
    """One reconciliation exception with severity classification."""
    claim_id: int
    exception_type: str  # STATUS_MISMATCH | AMOUNT_MISMATCH | INVESTIGATION_REQUIRED | ...
    severity: str        # CRITICAL | HIGH | MEDIUM | LOW
    detected_at: datetime
    provider: str
    beneficiary: str
    amount: Optional[Decimal]


@dataclass(frozen=True)
class ExceptionListDTO:
    """Paginated exception list with summary counts by type."""
    count: int
    summary: Dict[str, int]          # {exception_type: count}
    exceptions: List[ExceptionItemDTO] = field(default_factory=list)
