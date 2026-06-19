from typing import List, Optional
from ..models import ReconciliationRecord


class ReconciliationRepository:
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
    ) -> ReconciliationRecord:
        return ReconciliationRecord.objects.create(
            claim_id=claim_id,
            result=result,
            gateway_status=gateway_status,
            bank_status=bank_status,
            gateway_amount=gateway_amount,
            bank_amount=bank_amount,
            reason=reason,
            payment_item_id=payment_item_id,
        )

    def get_all(self) -> List[ReconciliationRecord]:
        return list(ReconciliationRecord.objects.select_related("payment_item").all())

    def get_failed(self) -> List[ReconciliationRecord]:
        failed_results = [
            "STATUS_MISMATCH",
            "INVESTIGATION_REQUIRED",
            "AMOUNT_MISMATCH",
            "NOT_SENT",
        ]
        return list(ReconciliationRecord.objects.filter(result__in=failed_results).all())

    def delete_for_claims(self, claim_ids: List[int]) -> None:
        ReconciliationRecord.objects.filter(claim_id__in=claim_ids).delete()
