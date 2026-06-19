"""
Reconciliation repository — Django ORM implementation of AbstractReconciliationRepository.

All ReconciliationRecord and related PaymentItem ORM access lives here.
Services import AbstractReconciliationRepository from base.py, not this class directly,
enabling test-time injection of stubs.
"""
from decimal import Decimal
from typing import Dict, List, Optional

from .base import AbstractReconciliationRepository
from ..dtos.reconciliation import ReconciliationRecordDTO
from ..dtos.payment import FailedPaymentDTO


_ERROR_RESULTS = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}


class ReconciliationRepository(AbstractReconciliationRepository):

    def delete_for_claims(self, claim_ids: List[int]) -> None:
        from ..models import ReconciliationRecord
        ReconciliationRecord.objects.filter(claim_id__in=claim_ids).delete()

    def create_record(
        self,
        claim_id: int,
        result: str,
        gateway_status: str,
        bank_status: str,
        gateway_amount: Optional[Decimal],
        bank_amount: Optional[Decimal],
        reason: str,
        payment_item_id: Optional[int] = None,
    ) -> ReconciliationRecordDTO:
        from ..models import ReconciliationRecord, PaymentItem
        if not payment_item_id:
            pi = PaymentItem.objects.filter(claim_id=claim_id).order_by("-created_at").first()
            if pi:
                payment_item_id = pi.id
        rec = ReconciliationRecord.objects.create(
            claim_id=claim_id,
            result=result,
            gateway_status=gateway_status,
            bank_status=bank_status,
            gateway_amount=gateway_amount,
            bank_amount=bank_amount,
            reason=reason,
            payment_item_id=payment_item_id,
        )
        return self._to_dto(rec, batch_id=self._batch_id_for_item(payment_item_id))

    def list_all(self) -> List[ReconciliationRecordDTO]:
        from ..models import ReconciliationRecord
        return [
            ReconciliationRecordDTO(
                id=r["id"],
                claim_id=r["claim_id"],
                gateway_status=r["gateway_status"] or "",
                bank_status=r["bank_status"] or "",
                gateway_amount=r["gateway_amount"],
                bank_amount=r["bank_amount"],
                result=r["result"],
                reason=r["reason"] or "",
                created_at=r["created_at"],
                batch_id=r.get("payment_item__batch_id"),
            )
            for r in ReconciliationRecord.objects.all().values(
                "id", "claim_id", "gateway_status", "bank_status",
                "gateway_amount", "bank_amount", "result", "reason", "created_at",
                "payment_item__batch_id",
            )
        ]

    def list_failed(self) -> List[FailedPaymentDTO]:
        from ..models import ReconciliationRecord
        rows = ReconciliationRecord.objects.filter(
            result__in=_ERROR_RESULTS,
        ).values(
            "id", "claim_id", "gateway_status", "bank_status",
            "gateway_amount", "bank_amount", "result", "reason", "created_at",
            "payment_item__batch_id",
        )
        return [
            FailedPaymentDTO(
                id=r["id"],
                claim_id=r["claim_id"],
                gateway_status=r["gateway_status"] or "",
                bank_status=r["bank_status"] or "",
                gateway_amount=r["gateway_amount"],
                bank_amount=r["bank_amount"],
                result=r["result"],
                recon_result=r["result"],
                reason=r["reason"] or "",
                created_at=r["created_at"],
                batch_id=r.get("payment_item__batch_id"),
            )
            for r in rows
        ]

    def get_status_map(self, claim_ids: List[int]) -> Dict[int, str]:
        from ..models import ReconciliationRecord
        return dict(
            ReconciliationRecord.objects
            .filter(claim_id__in=claim_ids)
            .order_by("-created_at")
            .values_list("claim_id", "result")
        )

    def get_item_status_map(self, claim_ids: List[int]) -> Dict[int, str]:
        from ..models import PaymentItem
        return dict(
            PaymentItem.objects
            .filter(claim_id__in=claim_ids)
            .order_by("-created_at")
            .values_list("claim_id", "status")
        )

    # ── Legacy method — kept so ReconciliationService still compiles ──────────
    # (the service will be updated to call create_record() in the next step)

    def create(
        self,
        claim_id: int,
        result: str,
        gateway_status: str = "",
        bank_status: str = "",
        gateway_amount=None,
        bank_amount=None,
        reason: str = "",
        payment_item_id: Optional[int] = None,
    ) -> ReconciliationRecordDTO:
        return self.create_record(
            claim_id=claim_id,
            result=result,
            gateway_status=gateway_status,
            bank_status=bank_status,
            gateway_amount=gateway_amount,
            bank_amount=bank_amount,
            reason=reason,
            payment_item_id=payment_item_id,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _batch_id_for_item(self, payment_item_id: Optional[int]) -> Optional[int]:
        if not payment_item_id:
            return None
        from ..models import PaymentItem
        row = PaymentItem.objects.filter(pk=payment_item_id).values("batch_id").first()
        return row["batch_id"] if row else None

    def _to_dto(self, rec, batch_id: Optional[int]) -> ReconciliationRecordDTO:
        return ReconciliationRecordDTO(
            id=rec.id,
            claim_id=rec.claim_id,
            gateway_status=rec.gateway_status or "",
            bank_status=rec.bank_status or "",
            gateway_amount=rec.gateway_amount,
            bank_amount=rec.bank_amount,
            result=rec.result,
            reason=rec.reason or "",
            created_at=rec.created_at,
            batch_id=batch_id,
        )

    def get_gateway_logs(self, claim_ids: Optional[List[int]] = None) -> List[dict]:
        from ..models import SOSYSPaymentLog
        qs = SOSYSPaymentLog.objects.all().order_by("-updated_at")
        if claim_ids:
            qs = qs.filter(claim_id__in=claim_ids)
        seen = set()
        results = []
        for item in qs.values("claim_id", "status", "amount"):
            if item["claim_id"] not in seen:
                seen.add(item["claim_id"])
                results.append(item)
        return results

    def get_bank_statement_rows(self, claim_ids: Optional[List[int]] = None) -> List[dict]:
        from ..models import BankStatementRow
        qs = BankStatementRow.objects.all().order_by("-settlement_date")
        if claim_ids:
            qs = qs.filter(claim_id__in=claim_ids)
        seen = set()
        results = []
        for item in qs.values("claim_id", "status", "amount"):
            if item["claim_id"] not in seen:
                seen.add(item["claim_id"])
                results.append(item)
        return results

    def update_payment_item_status_from_bank(self, claim_id: int, bank_status: Optional[str]) -> None:
        if not bank_status:
            return
        from ..models import PaymentItem
        item = PaymentItem.objects.filter(claim_id=claim_id).order_by("-created_at").first()
        if not item:
            return
        item_status = "SUCCESS" if bank_status.upper() == "SUCCESS" else "FAILED"
        if item.status != item_status:
            item.status = item_status
            item.save(update_fields=["status", "updated_at"])
