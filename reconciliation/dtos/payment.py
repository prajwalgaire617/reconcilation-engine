"""
Payment DTOs — contracts for payment status computation and failed payment reporting.

PaymentStatusDTO  : the derived 4-tier UI status for a single claim
FailedPaymentDTO  : one failed/exception claim for the Failed Payments Center
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class PaymentStatusDTO:
    """
    The 4-tier payment status for a single claim.

    Tier 1 (authoritative): from ReconciliationRecord.result
      MATCHED            → DONE
      SETTLEMENT_PENDING → PENDING (but technically submitted)
      ERROR results      → ERROR

    Tier 2: from PaymentItem.status
      SUCCESS  → SUBMITTED (NCHL accepted, not yet reconciled)
      PENDING  → BATCHED   (in a batch queue, not yet executed)
      FAILED   → ERROR

    Tier 3 (default): no PaymentItem at all
      → PENDING (not batched yet)
    """
    claim_id: int
    status: str      # PENDING | BATCHED | SUBMITTED | DONE | ERROR


@dataclass(frozen=True)
class FailedPaymentDTO:
    """Output DTO: one record in the Failed Payments Center."""
    id: int
    claim_id: int
    gateway_status: str
    bank_status: str
    gateway_amount: Optional[Decimal]
    bank_amount: Optional[Decimal]
    result: str
    recon_result: Optional[str]
    reason: str
    created_at: datetime
    batch_id: Optional[int]          # for retry button
