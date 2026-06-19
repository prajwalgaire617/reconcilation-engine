"""
Abstract repository base classes — the Repository Pattern contracts.

Why abstract bases?
-------------------
Services import these interfaces, not the concrete Django ORM implementations.
This means:
  - Services are testable: inject a stub that implements the ABC.
  - Swapping from SQLite → PostgreSQL → Redis cache only changes the concrete class.
  - The service layer is completely ignorant of how data is persisted.

Each concrete repository class in this package implements one of these ABCs.
The service constructor receives the concrete repo via dependency injection
(defaulting to the ORM implementation so callers don't need to wire it manually).
"""
from abc import ABC, abstractmethod
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

from ..dtos.claim import FHIRClaimDTO, ClaimListItemDTO, HospitalDTO
from ..dtos.batch import BatchDTO, BatchDetailDTO, BatchItemDTO
from ..dtos.reconciliation import ReconciliationRecordDTO
from ..dtos.payment import FailedPaymentDTO
from ..dtos.queue import QueueEntryDTO


class AbstractClaimRepository(ABC):
    @abstractmethod
    def upsert_all(self, dtos: List[FHIRClaimDTO]) -> Dict[str, int]:
        """Upsert claims from FHIR. Returns {created, updated, skipped}."""

    @abstractmethod
    def list_claims(
        self,
        hospital_id: Optional[str] = None,
        fhir_status: Optional[str] = None,
        months: Optional[int] = None,
    ) -> List[FHIRClaimDTO]:
        """Return claims as DTOs."""

    @abstractmethod
    def get_by_ids(self, ids: List[int]) -> List[FHIRClaimDTO]:
        """Return claims for database IDs."""

    @abstractmethod
    def get_by_fhir_ids(self, fhir_ids: List[str]) -> List[FHIRClaimDTO]:
        """Return claims for FHIR IDs."""

    @abstractmethod
    def hospitals(self) -> List[HospitalDTO]:
        """Return distinct hospitals with claim counts."""

    @abstractmethod
    def last_sync(self) -> Optional[datetime]:
        """Return the most recent last_synced timestamp."""


class AbstractBatchRepository(ABC):
    @abstractmethod
    def create_batch(
        self,
        batch_number: str,
        hospital_id: str,
        hospital_name: str,
        parent_batch_id: Optional[int] = None,
        retry_count: int = 0,
    ) -> int:
        """Create a PaymentBatch. Returns the new batch PK."""

    @abstractmethod
    def bulk_create_items(self, batch_id: int, items: List[dict]) -> int:
        """Bulk-create PaymentItems for a batch. Returns count created."""

    @abstractmethod
    def get_batch_detail(self, batch_id: int) -> Optional[BatchDetailDTO]:
        """Return full batch detail with all items and payment statuses."""

    @abstractmethod
    def list_batches(self) -> List[BatchDTO]:
        """Return all batches as DTOs."""

    @abstractmethod
    def update_batch_status(self, batch_id: int, status: str) -> None:
        """Update PaymentBatch.status."""

    @abstractmethod
    def update_item_status(
        self,
        item_id: int,
        status: str,
        gateway_reference: str = "",
    ) -> None:
        """Update a single PaymentItem status + gateway_reference."""

    @abstractmethod
    def get_batch_with_items(self, batch_id: int) -> Optional[dict]:
        """Return batch + item list as raw dicts (for gateway submission)."""

    @abstractmethod
    def update_items_from_response(self, batch_id: int, results: List[dict]) -> None:
        """Update batch items based on gateway submission responses."""

    @abstractmethod
    def mark_all_items_failed(self, batch_id: int) -> None:
        """Mark all items in a batch as FAILED."""


class AbstractQueueRepository(ABC):
    @abstractmethod
    def list_queue(self) -> List[QueueEntryDTO]:
        """Return all queue entries ordered by position."""

    @abstractmethod
    def get_queue_entry(self, queue_id: int) -> Optional[QueueEntryDTO]:
        """Return a single queue entry by ID."""

    @abstractmethod
    def enqueue_batches(self, batch_ids: List[int], scheduled_at: datetime) -> int:
        """Enqueue multiple batches. Returns count queued."""

    @abstractmethod
    def cancel_entry(self, queue_id: int) -> None:
        """Set status of queue entry to CANCELLED."""

    @abstractmethod
    def move_entry(self, queue_id: int, direction: str) -> None:
        """Swap positions of an entry and its neighbor."""

    @abstractmethod
    def get_due_entries(self) -> List[QueueEntryDTO]:
        """Return all QUEUED entries whose scheduled_at <= now."""

    @abstractmethod
    def update_queue_status(self, queue_id: int, status: str, executed_at: Optional[datetime] = None, notes: str = "") -> None:
        """Update queue status, executed_at, and notes."""


class AbstractReconciliationRepository(ABC):
    @abstractmethod
    def delete_for_claims(self, claim_ids: List[int]) -> None:
        """Delete existing ReconciliationRecords before re-running."""

    @abstractmethod
    def create_record(
        self,
        claim_id: int,
        result: str,
        gateway_status: str,
        bank_status: str,
        gateway_amount: Optional[Decimal],
        bank_amount: Optional[Decimal],
        reason: str,
        payment_item_id: Optional[int],
    ) -> ReconciliationRecordDTO:
        """Persist one reconciliation result and return as DTO."""

    @abstractmethod
    def list_all(self) -> List[ReconciliationRecordDTO]:
        """Return all reconciliation records."""

    @abstractmethod
    def list_failed(self) -> List[FailedPaymentDTO]:
        """Return records with error results, annotated with batch_id."""

    @abstractmethod
    def get_status_map(self, claim_ids: List[int]) -> Dict[int, str]:
        """Return {claim_id: recon_result} for bulk status computation."""

    @abstractmethod
    def get_item_status_map(self, claim_ids: List[int]) -> Dict[int, str]:
        """Return {claim_id: PaymentItem.status} for bulk status computation."""

    @abstractmethod
    def get_gateway_logs(self, claim_ids: Optional[List[int]] = None) -> List[dict]:
        """Fetch gateway logs (claim_id, status, amount) filtered by claim_ids."""

    @abstractmethod
    def get_bank_statement_rows(self, claim_ids: Optional[List[int]] = None) -> List[dict]:
        """Fetch bank statement rows (claim_id, status, amount) filtered by claim_ids."""

    @abstractmethod
    def update_payment_item_status_from_bank(self, claim_id: int, bank_status: Optional[str]) -> None:
        """Update PaymentItem status based on bank statement status."""


class AbstractOpsRepository(ABC):
    @abstractmethod
    def get_dashboard_summary_metrics(self, months: int) -> dict:
        """Return dict of dashboard summary counters."""

    @abstractmethod
    def get_ops_summary_metrics(self) -> dict:
        """Return dict of counts and sums for operations summary."""

    @abstractmethod
    def get_action_queue(self) -> List[dict]:
        """Return list of action items requiring human attention."""

    @abstractmethod
    def get_ops_activities(self, cutoff: datetime) -> List[dict]:
        """Return raw activities since cutoff date."""

    @abstractmethod
    def get_claim_timeline_events(self, claim_id: int) -> List[dict]:
        """Return raw event lists for timeline."""

    @abstractmethod
    def get_exceptions_list(self, exception_type: Optional[str]) -> List[dict]:
        """Return list of exceptions."""
