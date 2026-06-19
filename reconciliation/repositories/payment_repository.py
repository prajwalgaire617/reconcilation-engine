from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional
from django.db import transaction
from django.db.models import Count, Sum, Exists, OuterRef

from .base import AbstractBatchRepository, AbstractQueueRepository
from ..models import PaymentBatch, PaymentItem, PaymentQueue, ReconciliationRecord, FHIRClaim, QueueStatus, SOSYSPaymentLog, BankStatementRow
from ..dtos.batch import BatchDTO, BatchDetailDTO, BatchItemDTO
from ..dtos.queue import QueueEntryDTO


class BatchRepository(AbstractBatchRepository):
    """
    Concrete repository implementation for PaymentBatch & PaymentItem.
    """
    def create_batch(
        self,
        batch_number: str,
        hospital_id: str,
        hospital_name: str,
        parent_batch_id: Optional[int] = None,
        retry_count: int = 0,
    ) -> int:
        batch = PaymentBatch.objects.create(
            batch_number=batch_number,
            hospital_id=hospital_id,
            hospital_name=hospital_name,
            parent_batch_id=parent_batch_id,
            retry_count=retry_count,
        )
        return batch.id

    def bulk_create_items(self, batch_id: int, items: List[dict]) -> int:
        objs = [
            PaymentItem(batch_id=batch_id, claim_id=item["claim_id"], amount=item["amount"])
            for item in items
        ]
        created = PaymentItem.objects.bulk_create(objs)
        return len(created)

    def get_batch_detail(self, batch_id: int) -> Optional[BatchDetailDTO]:
        batch = PaymentBatch.objects.filter(pk=batch_id).first()
        if not batch:
            return None

        items = list(batch.items.all())
        claim_ids = [item.claim_id for item in items]

        # Fetch ReconciliationRecord outcomes
        recon_map = dict(
            ReconciliationRecord.objects.filter(claim_id__in=claim_ids)
            .order_by("-created_at")
            .values_list("claim_id", "result")
        )

        # Fetch FHIRClaim fields
        fhir_claims = FHIRClaim.objects.filter(fhir_id__in=[str(cid) for cid in claim_ids])
        fhir_map = {int(c.fhir_id): c for c in fhir_claims if c.fhir_id.isdigit()}

        DONE_RESULTS    = {"MATCHED"}
        PENDING_RESULTS = {"SETTLEMENT_PENDING"}
        ERROR_RESULTS   = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}

        dto_items = []
        for item in items:
            cid = item.claim_id
            recon_res = recon_map.get(cid)
            
            # Resolve 4-tier UI payment status
            if recon_res in DONE_RESULTS:
                pay_status = "DONE"
            elif recon_res in PENDING_RESULTS:
                pay_status = "PENDING"
            elif recon_res in ERROR_RESULTS:
                pay_status = "ERROR"
            elif item.status == "FAILED":
                pay_status = "ERROR"
            elif item.status == "SUCCESS":
                pay_status = "SUBMITTED"
            elif item.status == "PENDING":
                pay_status = "BATCHED"
            else:
                pay_status = "PENDING"

            fhir = fhir_map.get(cid)
            dto_items.append(
                BatchItemDTO(
                    id=item.id,
                    claim_id=cid,
                    amount=item.amount,
                    status=item.status,
                    gateway_reference=item.gateway_reference,
                    created_at=item.created_at,
                    patient_name=fhir.patient_name if fhir else "",
                    hospital_name=fhir.hospital_name if fhir else batch.hospital_name,
                    payment_status=pay_status,
                    recon_result=recon_res,
                )
            )

        total_amount = sum(item.amount for item in items)
        can_resubmit = batch.status in ("PENDING", "FAILED")

        return BatchDetailDTO(
            id=batch.id,
            batch_number=batch.batch_number,
            hospital_id=batch.hospital_id,
            hospital_name=batch.hospital_name,
            status=batch.status,
            retry_count=batch.retry_count,
            claim_count=len(items),
            total_amount=total_amount,
            created_at=batch.created_at,
            can_resubmit=can_resubmit,
            items=dto_items,
        )

    def list_batches(self) -> List[BatchDTO]:
        queued_batches = PaymentQueue.objects.filter(
            batch=OuterRef("pk"),
            status__in=["QUEUED", "EXECUTING"],
        )
        batches = (
            PaymentBatch.objects
            .annotate(
                claim_count=Count("items"),
                total_amount=Sum("items__amount"),
                in_queue=Exists(queued_batches),
            )
            .order_by("-created_at")
        )
        
        dto_list = []
        for b in batches:
            can_resubmit = b.status in ("PENDING", "FAILED")
            dto_list.append(
                BatchDTO(
                    id=b.id,
                    batch_number=b.batch_number,
                    hospital_id=b.hospital_id,
                    hospital_name=b.hospital_name or b.hospital_id,
                    status=b.status,
                    retry_count=b.retry_count,
                    claim_count=b.claim_count or 0,
                    total_amount=b.total_amount or Decimal("0"),
                    created_at=b.created_at,
                    can_resubmit=can_resubmit,
                    in_queue=b.in_queue,
                )
            )
        return dto_list

    def update_batch_status(self, batch_id: int, status: str) -> None:
        PaymentBatch.objects.filter(pk=batch_id).update(status=status, updated_at=datetime.now())

    def update_item_status(
        self,
        item_id: int,
        status: str,
        gateway_reference: str = "",
    ) -> None:
        PaymentItem.objects.filter(pk=item_id).update(
            status=status,
            gateway_reference=gateway_reference,
            updated_at=datetime.now(),
        )

    def get_batch_with_items(self, batch_id: int) -> Optional[dict]:
        batch = PaymentBatch.objects.filter(pk=batch_id).first()
        if not batch:
            return None
        return {
            "id": batch.id,
            "batch_number": batch.batch_number,
            "hospital_id": batch.hospital_id,
            "hospital_name": batch.hospital_name,
            "status": batch.status,
            "items": [
                {"id": item.id, "claim_id": item.claim_id, "amount": item.amount, "status": item.status}
                for item in batch.items.all()
            ],
        }

    def update_items_from_response(self, batch_id: int, results: List[dict]) -> None:
        batch = PaymentBatch.objects.filter(pk=batch_id).first()
        if not batch:
            return
        item_map = {item.claim_id: item for item in batch.items.all()}
        for res in results:
            item = item_map.get(res.get("claim_id"))
            if not item:
                continue
            gw_status = res.get("status", "FAILED")
            item.status = "SUCCESS" if gw_status == "SUCCESS" else "FAILED"
            item.gateway_reference = res.get("gateway_reference", "")
            item.save(update_fields=["status", "gateway_reference", "updated_at"])

    def mark_all_items_failed(self, batch_id: int) -> None:
        PaymentItem.objects.filter(batch_id=batch_id).update(status="FAILED", updated_at=datetime.now())


class QueueRepository(AbstractQueueRepository):
    """
    Concrete repository implementation for PaymentQueue.
    """
    def list_queue(self) -> List[QueueEntryDTO]:
        entries = (
            PaymentQueue.objects
            .select_related("batch")
            .annotate(
                claim_count=Count("batch__items"),
                total_amount=Sum("batch__items__amount"),
            )
            .order_by("position", "scheduled_at")
        )
        return [
            QueueEntryDTO(
                id=e.id,
                position=e.position,
                batch_id=e.batch.id,
                batch_number=e.batch.batch_number,
                hospital_id=e.batch.hospital_id,
                hospital_name=e.batch.hospital_name or e.batch.hospital_id or "—",
                scheduled_at=e.scheduled_at,
                status=e.status,
                executed_at=e.executed_at,
                notes=e.notes,
                created_at=e.created_at,
                claim_count=e.claim_count or 0,
                total_amount=e.total_amount or Decimal("0"),
            )
            for e in entries
        ]

    def get_queue_entry(self, queue_id: int) -> Optional[QueueEntryDTO]:
        e = (
            PaymentQueue.objects
            .filter(pk=queue_id)
            .select_related("batch")
            .annotate(
                claim_count=Count("batch__items"),
                total_amount=Sum("batch__items__amount"),
            )
            .first()
        )
        if not e:
            return None
        return QueueEntryDTO(
            id=e.id,
            position=e.position,
            batch_id=e.batch.id,
            batch_number=e.batch.batch_number,
            hospital_id=e.batch.hospital_id,
            hospital_name=e.batch.hospital_name or e.batch.hospital_id or "—",
            scheduled_at=e.scheduled_at,
            status=e.status,
            executed_at=e.executed_at,
            notes=e.notes,
            created_at=e.created_at,
            claim_count=e.claim_count or 0,
            total_amount=e.total_amount or Decimal("0"),
        )

    def enqueue_batches(self, batch_ids: List[int], scheduled_at: datetime) -> int:
        with transaction.atomic():
            last = PaymentQueue.objects.order_by("-position").first()
            next_pos = (last.position + 1) if last else 1
            count = 0
            for bid in batch_ids:
                try:
                    batch = PaymentBatch.objects.get(pk=bid)
                except PaymentBatch.DoesNotExist:
                    continue
                if batch.status in ("SUBMITTED", "COMPLETED"):
                    raise ValueError(
                        f"Batch {bid} is already {batch.status} — cannot re-run a completed payment."
                    )
                if hasattr(batch, "queue_entry"):
                    continue
                PaymentQueue.objects.create(
                    batch=batch,
                    position=next_pos,
                    scheduled_at=scheduled_at,
                )
                next_pos += 1
                count += 1
        return count

    def cancel_entry(self, queue_id: int) -> None:
        PaymentQueue.objects.filter(pk=queue_id).update(status=QueueStatus.CANCELLED)

    def move_entry(self, queue_id: int, direction: str) -> None:
        entry = PaymentQueue.objects.filter(pk=queue_id).first()
        if not entry:
            return
        if direction == "up":
            neighbour = (
                PaymentQueue.objects
                .filter(position__lt=entry.position, status=QueueStatus.QUEUED)
                .order_by("-position").first()
            )
        else:
            neighbour = (
                PaymentQueue.objects
                .filter(position__gt=entry.position, status=QueueStatus.QUEUED)
                .order_by("position").first()
            )
        if not neighbour:
            return
        with transaction.atomic():
            entry.position, neighbour.position = neighbour.position, entry.position
            entry.save(update_fields=["position"])
            neighbour.save(update_fields=["position"])

    def get_due_entries(self) -> List[QueueEntryDTO]:
        now = datetime.now()
        due = (
            PaymentQueue.objects
            .select_related("batch")
            .filter(status=QueueStatus.QUEUED, scheduled_at__lte=now)
            .annotate(
                claim_count=Count("batch__items"),
                total_amount=Sum("batch__items__amount"),
            )
            .order_by("position")
        )
        return [
            QueueEntryDTO(
                id=e.id,
                position=e.position,
                batch_id=e.batch.id,
                batch_number=e.batch.batch_number,
                hospital_id=e.batch.hospital_id,
                hospital_name=e.batch.hospital_name or e.batch.hospital_id or "—",
                scheduled_at=e.scheduled_at,
                status=e.status,
                executed_at=e.executed_at,
                notes=e.notes,
                created_at=e.created_at,
                claim_count=e.claim_count or 0,
                total_amount=e.total_amount or Decimal("0"),
            )
            for e in due
        ]

    def update_queue_status(self, queue_id: int, status: str, executed_at: Optional[datetime] = None, notes: str = "") -> None:
        update_fields = {"status": status}
        if executed_at:
            update_fields["executed_at"] = executed_at
        if notes is not None:
            update_fields["notes"] = notes
        PaymentQueue.objects.filter(pk=queue_id).update(**update_fields)


# ── Shims for Legacy Code ───────────────────────────────────────────────────

class PaymentBatchRepository:
    def create(self, batch_number: str, parent_batch_id: Optional[int] = None, retry_count: int = 0,
               hospital_id: str = "", hospital_name: str = "") -> PaymentBatch:
        return PaymentBatch.objects.create(
            batch_number=batch_number,
            hospital_id=hospital_id,
            hospital_name=hospital_name,
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
