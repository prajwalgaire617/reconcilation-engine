import logging
from decimal import Decimal
from typing import List, Optional

from ..dtos.reconciliation import ReconciliationSummaryDTO, ReconciliationRecordDTO, RunReconciliationCommand
from ..models import ReconciliationResult
from ..repositories.base import AbstractReconciliationRepository
from ..repositories.reconciliation_repository import ReconciliationRepository

log = logging.getLogger(__name__)

ReconciliationSummary = ReconciliationSummaryDTO


class ReconciliationService:
    """
    ReconciliationService — NCHL vs SOSYS matching engine.
    Encapsulates reconciliation rules and logic.
    """
    AMOUNT_TOLERANCE = Decimal("0.01")

    def __init__(self, recon_repo: Optional[AbstractReconciliationRepository] = None):
        self._recon = recon_repo or ReconciliationRepository()

    def run(self, claim_ids: Optional[List[int]] = None) -> ReconciliationSummaryDTO:
        # Load payments and logs via Repository
        nchl_items = self._recon.get_gateway_logs(claim_ids=claim_ids)
        nchl_by_claim = {item["claim_id"]: item for item in nchl_items}

        sosys_logs = self._recon.get_bank_statement_rows(claim_ids=claim_ids)
        sosys_by_claim = {log["claim_id"]: log for log in sosys_logs}

        target_ids = set(nchl_by_claim.keys()) | set(sosys_by_claim.keys())
        if not target_ids:
            return ReconciliationSummaryDTO(0, 0, 0, 0, 0, 0, 0, [])

        self._recon.delete_for_claims(list(target_ids))

        records: List[ReconciliationRecordDTO] = []
        for cid in sorted(target_ids):
            rec = self._reconcile_one(cid, nchl_by_claim, sosys_by_claim)
            records.append(rec)
            self._recon.update_payment_item_status_from_bank(
                cid,
                sosys_by_claim.get(cid, {}).get("status")
            )

        return self._build_summary(records)

    def run_from_command(self, cmd: RunReconciliationCommand) -> ReconciliationSummaryDTO:
        return self.run(claim_ids=cmd.claim_ids)

    def run_for_batch(self, batch_detail) -> ReconciliationSummaryDTO:
        # Expects BatchDetailDTO or similar
        claim_ids = [item.claim_id for item in batch_detail.items]
        return self.run(claim_ids=claim_ids)

    def _reconcile_one(self, claim_id: int, nchl_index: dict, sosys_index: dict) -> ReconciliationRecordDTO:
        nchl  = nchl_index.get(claim_id)
        sosys = sosys_index.get(claim_id)

        nchl_status  = nchl["status"]  if nchl  else ""
        sosys_status = sosys["status"] if sosys else ""
        nchl_amount  = nchl["amount"]  if nchl  else None
        sosys_amount = sosys["amount"] if sosys else None

        result, reason = self._apply_rules(nchl_status, sosys_status, nchl_amount, sosys_amount)

        return self._recon.create_record(
            claim_id        = claim_id,
            result          = result,
            gateway_status  = nchl_status,
            bank_status     = sosys_status,
            gateway_amount  = nchl_amount,
            bank_amount     = sosys_amount,
            reason          = reason,
        )

    def _apply_rules(self, nchl_status, sosys_status, nchl_amount, sosys_amount):
        if not nchl_status:
            return ReconciliationResult.NOT_SENT, "No NCHL gateway record for this claim."

        if nchl_amount and sosys_amount and abs(nchl_amount - sosys_amount) > self.AMOUNT_TOLERANCE:
            return ReconciliationResult.AMOUNT_MISMATCH, (
                f"Amount mismatch: NCHL={nchl_amount}, SOSYS={sosys_amount}. Possible partial settlement."
            )

        if nchl_status == "SUCCESS" and sosys_status == "SUCCESS":
            return ReconciliationResult.MATCHED, "NCHL and SOSYS both confirm payment."
        if nchl_status == "SUCCESS" and not sosys_status:
            return ReconciliationResult.SETTLEMENT_PENDING, (
                "NCHL processed payment but SOSYS has not yet confirmed. Awaiting settlement."
            )
        if nchl_status == "SUCCESS" and sosys_status == "FAILED":
            return ReconciliationResult.STATUS_MISMATCH, (
                "NCHL reports success but SOSYS reports failure. Manual review required."
            )
        if nchl_status == "FAILED" and sosys_status == "SUCCESS":
            return ReconciliationResult.INVESTIGATION_REQUIRED, (
                "NCHL reports failure but SOSYS confirms settlement. Risk of double payment — freeze immediately."
            )
        if nchl_status == "FAILED" and not sosys_status:
            return ReconciliationResult.STATUS_MISMATCH, "NCHL reports failure and SOSYS has no record."

        return ReconciliationResult.STATUS_MISMATCH, (
            f"Unhandled state: NCHL={nchl_status}, SOSYS={sosys_status}."
        )

    def _build_summary(self, records: List[ReconciliationRecordDTO]) -> ReconciliationSummaryDTO:
        counts = {v: 0 for v in ReconciliationResult.values}
        for rec in records:
            counts[rec.result] = counts.get(rec.result, 0) + 1
        return ReconciliationSummaryDTO(
            total_claims           = len(records),
            matched                = counts.get(ReconciliationResult.MATCHED, 0),
            settlement_pending     = counts.get(ReconciliationResult.SETTLEMENT_PENDING, 0),
            status_mismatch        = counts.get(ReconciliationResult.STATUS_MISMATCH, 0),
            investigation_required = counts.get(ReconciliationResult.INVESTIGATION_REQUIRED, 0),
            amount_mismatch        = counts.get(ReconciliationResult.AMOUNT_MISMATCH, 0),
            not_sent               = counts.get(ReconciliationResult.NOT_SENT, 0),
            records                = records,
        )
