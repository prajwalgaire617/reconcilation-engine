from decimal import Decimal
from typing import List, Optional
from ..models import PaymentBatch, PaymentItem, SOSYSPaymentLog, BankStatementRow


class PaymentBatchRepository:
    def create(self, batch_number: str, parent_batch_id: Optional[int] = None, retry_count: int = 0) -> PaymentBatch:
        return PaymentBatch.objects.create(
            batch_number=batch_number,
            parent_batch_id=parent_batch_id,
            retry_count=retry_count,
        )

    def get_by_id(self, batch_id: int) -> Optional[PaymentBatch]:
        return PaymentBatch.objects.filter(pk=batch_id).first()

    def get_by_number(self, batch_number: str) -> Optional[PaymentBatch]:
        return PaymentBatch.objects.filter(batch_number=batch_number).first()

    def update_status(self, batch: PaymentBatch, status: str) -> PaymentBatch:
        batch.status = status
        batch.save(update_fields=["status", "updated_at"])
        return batch

    def list_all(self) -> List[PaymentBatch]:
        return list(PaymentBatch.objects.all())


class PaymentItemRepository:
    def bulk_create(self, batch: PaymentBatch, items: List[dict]) -> List[PaymentItem]:
        objs = [
            PaymentItem(batch=batch, claim_id=item["claim_id"], amount=item["amount"])
            for item in items
        ]
        return PaymentItem.objects.bulk_create(objs)

    def update_item(self, item: PaymentItem, status: str, gateway_reference: str = "") -> PaymentItem:
        item.status = status
        item.gateway_reference = gateway_reference
        item.save(update_fields=["status", "gateway_reference", "updated_at"])
        return item

    def get_failed_items(self, batch: PaymentBatch) -> List[PaymentItem]:
        return list(batch.items.filter(status=PaymentItem.status.field.choices))

    def get_failed_by_batch(self, batch: PaymentBatch) -> List[PaymentItem]:
        return list(batch.items.filter(status="FAILED"))


class SOSYSLogRepository:
    def create(self, claim_id: int, gateway_reference: str, amount: Decimal, status: str, payload: dict) -> SOSYSPaymentLog:
        return SOSYSPaymentLog.objects.create(
            claim_id=claim_id,
            gateway_reference=gateway_reference,
            amount=amount,
            status=status,
            response_payload=payload,
        )

    def get_by_claim(self, claim_id: int) -> Optional[SOSYSPaymentLog]:
        return SOSYSPaymentLog.objects.filter(claim_id=claim_id).order_by("-created_at").first()

    def all_indexed_by_claim(self) -> dict:
        logs = SOSYSPaymentLog.objects.all().order_by("-created_at")
        result = {}
        for log in logs:
            if log.claim_id not in result:
                result[log.claim_id] = log
        return result


class BankStatementRepository:
    def bulk_create(self, rows: List[dict], import_batch: str) -> List[BankStatementRow]:
        objs = [
            BankStatementRow(
                claim_id=r["claim_id"],
                transaction_id=r["transaction_id"],
                amount=r["amount"],
                status=r["status"],
                settlement_date=r["settlement_date"],
                import_batch=import_batch,
            )
            for r in rows
        ]
        return BankStatementRow.objects.bulk_create(objs)

    def all_indexed_by_claim(self) -> dict:
        rows = BankStatementRow.objects.all().order_by("-settlement_date")
        result = {}
        for row in rows:
            if row.claim_id not in result:
                result[row.claim_id] = row
        return result

    def get_by_claim(self, claim_id: int) -> Optional[BankStatementRow]:
        return BankStatementRow.objects.filter(claim_id=claim_id).order_by("-settlement_date").first()
