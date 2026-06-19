"""
Batch DTOs — contracts for payment batch creation and inspection.

CreateBatchCommand   : input from HTTP to create batches from specific claim IDs
AutoCreateBatchCommand: input to auto-group all PENDING claims into batches
BatchItemDTO         : one payment item within a batch
BatchDTO             : batch list row
BatchDetailDTO       : full batch with all its items and per-claim statuses
BatchListDTO         : list of batches
BatchCreateResultDTO : result of batch creation (how many batches, claims)
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import List, Optional


@dataclass(frozen=True)
class CreateBatchCommand:
    """Input DTO: create payment batches from a list of claim IDs."""
    claim_ids: List[int]
    batch_size: Optional[int] = None   # None = one batch per hospital, no size limit
    submit_now: bool = True            # True = submit to NCHL immediately


@dataclass(frozen=True)
class AutoCreateBatchCommand:
    """Input DTO: auto-group all PENDING claims into batches."""
    batch_size: int = 15
    submit_now: bool = False


@dataclass(frozen=True)
class BatchItemDTO:
    """Internal DTO: one item (claim) in a payment batch."""
    id: int
    claim_id: int
    amount: Decimal
    status: str                        # PENDING | SUCCESS | FAILED | RETRY
    gateway_reference: str
    created_at: datetime
    # Annotated from claim + reconciliation
    patient_name: str = ""
    hospital_name: str = ""
    payment_status: str = "PENDING"    # 4-tier UI status
    recon_result: Optional[str] = None


@dataclass(frozen=True)
class BatchDTO:
    """Output DTO: one row in the batches list."""
    id: int
    batch_number: str
    hospital_id: str
    hospital_name: str
    status: str                        # PENDING | SUBMITTED | PARTIAL | COMPLETED | FAILED
    retry_count: int
    claim_count: int
    total_amount: Decimal
    created_at: datetime
    can_resubmit: bool                 # False for SUBMITTED/COMPLETED — prevents double payment
    in_queue: bool = False


@dataclass(frozen=True)
class BatchDetailDTO:
    """Output DTO: full batch detail including all claim items."""
    id: int
    batch_number: str
    hospital_id: str
    hospital_name: str
    status: str
    retry_count: int
    claim_count: int
    total_amount: Decimal
    created_at: datetime
    can_resubmit: bool
    items: List[BatchItemDTO] = field(default_factory=list)


@dataclass(frozen=True)
class BatchListDTO:
    """Output DTO: list of batches with summary stats."""
    batches: List[BatchDTO]
    total_pending: int
    total_submitted: int
    total_completed: int
    total_failed: int


@dataclass(frozen=True)
class BatchCreateResultDetailDTO:
    hospital_id: str
    hospital_name: str
    batch_id: int
    batch_number: str
    claim_count: int
    total_amount: Decimal
    status: str
    failure_reason: str = ""


@dataclass(frozen=True)
class BatchCreateResultDTO:
    """Output DTO: result of batch creation."""
    batches_created: int
    claims_batched: int
    batch_numbers: List[str]
    submitted: bool                    # Whether batches were submitted to NCHL immediately
    batches: List[BatchCreateResultDetailDTO] = field(default_factory=list)
