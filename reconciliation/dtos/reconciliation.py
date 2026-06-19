"""
Reconciliation DTOs — contracts for the NCHL vs SOSYS matching engine.

RunReconciliationCommand: input to trigger reconciliation (specific claims or all)
ReconciliationRecordDTO : one reconciled claim record (output to views/API)
ReconciliationSummaryDTO: aggregate result of a reconciliation run
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import List, Optional


@dataclass(frozen=True)
class RunReconciliationCommand:
    """Input DTO: trigger reconciliation for specific claims or all unreconciled claims."""
    claim_ids: Optional[List[int]] = None   # None = reconcile ALL claims with PaymentItems


@dataclass(frozen=True)
class ReconciliationRecordDTO:
    """
    Output DTO: one row in the reconciliation results list.

    Mirrors ReconciliationRecord but as a plain dataclass so views and
    serializers never need to import Django models.
    """
    id: int
    claim_id: int
    gateway_status: str      # NCHL: SUCCESS | FAILED
    bank_status: str         # SOSYS: SUCCESS | FAILED | "" (not yet confirmed)
    gateway_amount: Optional[Decimal]
    bank_amount: Optional[Decimal]
    result: str              # MATCHED | SETTLEMENT_PENDING | STATUS_MISMATCH | ...
    reason: str
    created_at: datetime
    batch_id: Optional[int] = None   # which batch submitted this claim


@dataclass(frozen=True)
class ReconciliationSummaryDTO:
    """
    Output DTO: aggregate result of a reconciliation run.

    The service returns this so the Celery task can log it and the HTTP view
    can return it — both use the same typed result, not a raw dict.
    """
    total_claims: int
    matched: int
    settlement_pending: int
    status_mismatch: int
    investigation_required: int
    amount_mismatch: int
    not_sent: int
    records: List[ReconciliationRecordDTO] = field(default_factory=list)

    @property
    def total_errors(self) -> int:
        return self.status_mismatch + self.investigation_required + self.amount_mismatch + self.not_sent

    @property
    def match_rate(self) -> float:
        if not self.total_claims:
            return 0.0
        return round(self.matched / self.total_claims * 100, 2)

    def to_dict(self) -> dict:
        return {
            "total_claims":           self.total_claims,
            "matched":                self.matched,
            "settlement_pending":     self.settlement_pending,
            "status_mismatch":        self.status_mismatch,
            "investigation_required": self.investigation_required,
            "amount_mismatch":        self.amount_mismatch,
            "not_sent":               self.not_sent,
            "total_errors":           self.total_errors,
            "match_rate":             self.match_rate,
        }
