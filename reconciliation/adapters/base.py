"""
Abstract base adapters — Dependency Inversion Principle.
Services depend on these interfaces, never on concrete implementations.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional


@dataclass(frozen=True)
class PaymentItemResult:
    claim_id: int
    status: str          # SUCCESS | FAILED | PARTIAL_SUCCESS
    gateway_reference: str
    amount: Decimal
    settled_amount: Decimal
    transaction_id: str


@dataclass(frozen=True)
class BatchSubmitResult:
    gateway_batch_id: str
    batch_number: str
    overall_status: str  # SUCCESS | FAILED | PARTIAL_SUCCESS
    results: List[PaymentItemResult] = field(default_factory=list)


@dataclass(frozen=True)
class ConfirmationResult:
    claim_id: int
    status: str          # SUCCESS | FAILED (normalised)
    amount: Decimal
    transaction_id: str
    raw: dict = field(default_factory=dict)


class PaymentGatewayPort(ABC):
    """Port for payment gateway (NCHL or any other processor)."""

    @abstractmethod
    def submit_batch(self, batch_number: str, items: List[dict]) -> BatchSubmitResult:
        """Submit a batch of claims for payment processing."""

    @abstractmethod
    def get_batch_status(self, gateway_batch_id: str) -> dict:
        """Retrieve processing status for a previously submitted batch."""


class ConfirmationSystemPort(ABC):
    """Port for the confirmation / settlement system (SOSYS)."""

    @abstractmethod
    def get_claim_status(self, claim_id: int) -> Optional[ConfirmationResult]:
        """Fetch confirmation status for a single claim. Returns None if not found."""

    @abstractmethod
    def fetch_and_persist(self, claim_ids: List[int]) -> dict:
        """Bulk-fetch and persist confirmation records. Returns summary dict."""


class ReconciliationLogPort(ABC):
    """Port for structured audit logging of reconciliation events."""

    @abstractmethod
    def log_batch_submitted(self, batch_number: str, item_count: int, result: BatchSubmitResult) -> None:
        pass

    @abstractmethod
    def log_reconciliation_complete(self, batch_number: str, matched: int, pending: int, errors: int) -> None:
        pass

    @abstractmethod
    def log_error(self, context: str, error: Exception) -> None:
        pass
