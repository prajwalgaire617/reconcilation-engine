"""
Reconciliation Engine.

Bank statement is the source of truth.
Payments are only marked COMPLETED after bank confirmation.

Rules:
  Gateway SUCCESS + Bank SUCCESS   → MATCHED
  Gateway SUCCESS + Bank NOT FOUND → SETTLEMENT_PENDING
  Gateway SUCCESS + Bank FAILED    → STATUS_MISMATCH
  Gateway FAILED  + Bank SUCCESS   → INVESTIGATION_REQUIRED
  Amount mismatch                  → AMOUNT_MISMATCH
  No gateway record                → NOT_SENT
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import List

from ..models import ReconciliationResult
from ..repositories.payment_repository import (
    BankStatementRepository,
    PaymentBatchRepository,
    PaymentItemRepository,
    SOSYSLogRepository,
)
from ..repositories.reconciliation_repository import ReconciliationRepository


@dataclass
class ReconciliationSummary:
    total_claims: int
    matched: int
    settlement_pending: int
    status_mismatch: int
    investigation_required: int
    amount_mismatch: int
    not_sent: int
    results: list


class ReconciliationService:
    AMOUNT_TOLERANCE = Decimal("0.01")

    def __init__(
        self,
        sosys_repo: SOSYSLogRepository = None,
        bank_repo: BankStatementRepository = None,
        recon_repo: ReconciliationRepository = None,
        item_repo: PaymentItemRepository = None,
        batch_repo: PaymentBatchRepository = None,
    ):
        self._sosys = sosys_repo or SOSYSLogRepository()
        self._bank = bank_repo or BankStatementRepository()
        self._recon = recon_repo or ReconciliationRepository()
        self._item = item_repo or PaymentItemRepository()
        self._batch = batch_repo or PaymentBatchRepository()

    def run(self, claim_ids: List[int] = None) -> ReconciliationSummary:
        sosys_by_claim = self._sosys.all_indexed_by_claim()
        bank_by_claim = self._bank.all_indexed_by_claim()

        all_claim_ids = set(sosys_by_claim.keys()) | set(bank_by_claim.keys())
        if claim_ids:
            all_claim_ids = all_claim_ids & set(claim_ids)

        self._recon.delete_for_claims(list(all_claim_ids))

        results = []
        for claim_id in sorted(all_claim_ids):
            record = self._reconcile_claim(claim_id, sosys_by_claim, bank_by_claim)
            results.append(record)
            self._update_payment_item_from_bank(claim_id, bank_by_claim)

        return self._build_summary(results)

    def _reconcile_claim(self, claim_id: int, sosys_index: dict, bank_index: dict):
        gw_log = sosys_index.get(claim_id)
        bank_row = bank_index.get(claim_id)

        gw_status = gw_log.status.upper() if gw_log else ""
        bank_status = bank_row.status.upper() if bank_row else ""
        gw_amount = gw_log.amount if gw_log else None
        bank_amount = bank_row.amount if bank_row else None

        result, reason = self._apply_rules(gw_status, bank_status, gw_amount, bank_amount)

        return self._recon.create(
            claim_id=claim_id,
            result=result,
            gateway_status=gw_status,
            bank_status=bank_status,
            gateway_amount=gw_amount,
            bank_amount=bank_amount,
            reason=reason,
        )

    def _apply_rules(
        self, gw_status: str, bank_status: str, gw_amount, bank_amount
    ):
        if not gw_status:
            return ReconciliationResult.NOT_SENT, "No SOSYS/gateway record found for this claim."

        if gw_status == "SUCCESS" and bank_status == "SUCCESS":
            if gw_amount and bank_amount and abs(gw_amount - bank_amount) > self.AMOUNT_TOLERANCE:
                return ReconciliationResult.AMOUNT_MISMATCH, (
                    f"Gateway amount {gw_amount} does not match bank amount {bank_amount}."
                )
            return ReconciliationResult.MATCHED, "Gateway and bank both confirm success."

        if gw_status == "SUCCESS" and not bank_status:
            return ReconciliationResult.SETTLEMENT_PENDING, (
                "Gateway reports success but bank statement has no record yet."
            )

        if gw_status == "SUCCESS" and bank_status == "FAILED":
            return ReconciliationResult.STATUS_MISMATCH, (
                "Gateway reports success but bank reports failure. Manual review required."
            )

        if gw_status == "FAILED" and bank_status == "SUCCESS":
            return ReconciliationResult.INVESTIGATION_REQUIRED, (
                "Gateway reports failure but bank confirms settlement. Possible double payment risk."
            )

        if gw_amount and bank_amount and abs(gw_amount - bank_amount) > self.AMOUNT_TOLERANCE:
            return ReconciliationResult.AMOUNT_MISMATCH, (
                f"Amount mismatch: gateway={gw_amount}, bank={bank_amount}."
            )

        return ReconciliationResult.STATUS_MISMATCH, (
            f"Unhandled combination: gateway={gw_status}, bank={bank_status}."
        )

    def _update_payment_item_from_bank(self, claim_id: int, bank_index: dict) -> None:
        """Bank statement is source of truth — update PaymentItem status from bank."""
        from ..models import PaymentItem
        bank_row = bank_index.get(claim_id)
        if not bank_row:
            return
        item = PaymentItem.objects.filter(claim_id=claim_id).order_by("-created_at").first()
        if not item:
            return
        bank_status = bank_row.status.upper()
        item_status = "SUCCESS" if bank_status == "SUCCESS" else "FAILED"
        if item.status != item_status:
            item.status = item_status
            item.save(update_fields=["status", "updated_at"])

    def _build_summary(self, records: list) -> ReconciliationSummary:
        counts = {r: 0 for r in ReconciliationResult.values}
        for rec in records:
            counts[rec.result] = counts.get(rec.result, 0) + 1
        return ReconciliationSummary(
            total_claims=len(records),
            matched=counts.get(ReconciliationResult.MATCHED, 0),
            settlement_pending=counts.get(ReconciliationResult.SETTLEMENT_PENDING, 0),
            status_mismatch=counts.get(ReconciliationResult.STATUS_MISMATCH, 0),
            investigation_required=counts.get(ReconciliationResult.INVESTIGATION_REQUIRED, 0),
            amount_mismatch=counts.get(ReconciliationResult.AMOUNT_MISMATCH, 0),
            not_sent=counts.get(ReconciliationResult.NOT_SENT, 0),
            results=records,
        )
