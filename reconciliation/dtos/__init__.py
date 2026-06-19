"""
DTO (Data Transfer Object) layer — typed contracts between layers.

Why DTOs?
---------
Every layer boundary (HTTP → Service, Service → Repository) previously passed
raw Python dicts. This creates three problems:
  1. No type safety — a typo in a dict key fails silently at runtime.
  2. No documentation — callers don't know what keys are expected.
  3. No validation boundary — services must defensively re-validate input.

DTOs solve this by making the contract explicit and typed at each boundary:
  - Input DTOs  : carry validated data FROM the HTTP layer INTO services.
  - Output DTOs : carry typed results FROM services BACK to views/tasks.
  - Internal DTOs: carry data between services and repositories.

All DTOs use frozen dataclasses (immutable after construction) so a service
cannot accidentally mutate data it received from a repository.
"""
from .claim import (
    FetchClaimsCommand,
    ClaimListQuery,
    FHIRClaimDTO,
    ClaimListItemDTO,
    ClaimPageDTO,
    HospitalDTO,
    FHIRSyncResultDTO,
)
from .batch import (
    CreateBatchCommand,
    BatchItemDTO,
    BatchDTO,
    BatchDetailDTO,
    BatchListDTO,
    AutoCreateBatchCommand,
    BatchCreateResultDTO,
)
from .queue import (
    EnqueueCommand,
    QueueEntryDTO,
    QueueListDTO,
    ExecuteQueueResultDTO,
)
from .reconciliation import (
    ReconciliationRecordDTO,
    ReconciliationSummaryDTO,
    RunReconciliationCommand,
)
from .payment import (
    PaymentStatusDTO,
    FailedPaymentDTO,
)
from .ops import (
    ActionItemDTO,
    ActivityEventDTO,
    OpsSummaryDTO,
    OpsActivityDTO,
    ExceptionItemDTO,
    ExceptionListDTO,
)
from .statement import (
    ImportStatementCommand,
    StatementImportResultDTO,
)

__all__ = [
    # Claim
    "FetchClaimsCommand", "ClaimListQuery", "FHIRClaimDTO",
    "ClaimListItemDTO", "ClaimPageDTO", "HospitalDTO", "FHIRSyncResultDTO",
    # Batch
    "CreateBatchCommand", "BatchItemDTO", "BatchDTO", "BatchDetailDTO",
    "BatchListDTO", "AutoCreateBatchCommand", "BatchCreateResultDTO",
    # Queue
    "EnqueueCommand", "QueueEntryDTO", "QueueListDTO", "ExecuteQueueResultDTO",
    # Reconciliation
    "ReconciliationRecordDTO", "ReconciliationSummaryDTO", "RunReconciliationCommand",
    # Payment
    "PaymentStatusDTO", "FailedPaymentDTO",
    # Ops
    "ActionItemDTO", "ActivityEventDTO", "OpsSummaryDTO", "OpsActivityDTO",
    "ExceptionItemDTO", "ExceptionListDTO",
    # Statement
    "ImportStatementCommand", "StatementImportResultDTO",
]
