import uuid
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..dashboard.queries import DashboardQueries
from ..repositories.payment_repository import BankStatementRepository
from ..services.reconciliation_service import ReconciliationService
from ..services.retry_service import RetryService
from ..services.statement_parser import StatementParser
from .serializers import (
    BankStatementRowSerializer,
    DashboardSerializer,
    ReconciliationRecordSerializer,
    RetryBatchSerializer,
    RunReconciliationSerializer,
)


class FHIRClaimFetchView(APIView):
    """POST /claims/fetch — trigger a FHIR sync (manual, not nightly cron)."""

    def post(self, request):
        months = int(request.data.get("months", 3))
        from ..repositories.fhir_repository import FHIRApiClient, FHIRClaimRepository
        try:
            dtos = FHIRApiClient().fetch_claims(months=months)
        except ConnectionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        result = FHIRClaimRepository().upsert_all(dtos)
        return Response({
            "fetched": len(dtos),
            "created": result["created"],
            "updated": result["updated"],
            "skipped": result["skipped"],
        }, status=status.HTTP_200_OK)


def _compute_payment_status(claim_ids: list) -> dict:
    """
    Three-tier status derivation (most-specific wins):

    Tier 1 — ReconciliationRecord (authoritative, set after NCHL+SOSYS tally):
      MATCHED            → DONE
      SETTLEMENT_PENDING → PENDING
      STATUS_MISMATCH / INVESTIGATION_REQUIRED / AMOUNT_MISMATCH / NOT_SENT → ERROR

    Tier 2 — PaymentItem (intermediate, set after NCHL gateway call):
      SUCCESS → PENDING  (NCHL paid, SOSYS not yet tallied)
      FAILED  → ERROR    (NCHL failed)

    Tier 3 — default → PENDING (claim exists but not yet batched/submitted)
    """
    from ..models import PaymentItem, ReconciliationRecord
    DONE_RESULTS    = {"MATCHED"}
    PENDING_RESULTS = {"SETTLEMENT_PENDING"}
    ERROR_RESULTS   = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}

    # Tier 1: reconciliation records
    recon_map = dict(
        ReconciliationRecord.objects.filter(claim_id__in=claim_ids)
        .order_by("-created_at")
        .values_list("claim_id", "result")
    )

    # Tier 2: payment item statuses
    item_status_map = dict(
        PaymentItem.objects.filter(claim_id__in=claim_ids)
        .order_by("-created_at")
        .values_list("claim_id", "status")
    )

    out = {}
    for cid in claim_ids:
        recon = recon_map.get(cid)
        if recon in DONE_RESULTS:
            out[cid] = "DONE"
        elif recon in PENDING_RESULTS:
            out[cid] = "PENDING"
        elif recon in ERROR_RESULTS:
            out[cid] = "ERROR"
        else:
            # No reconciliation record yet — fall back to PaymentItem
            item_st = item_status_map.get(cid)
            if item_st == "FAILED":
                out[cid] = "ERROR"
            elif item_st == "SUCCESS":
                out[cid] = "PENDING"   # NCHL paid, awaiting SOSYS tally
            else:
                out[cid] = "PENDING"   # not batched or not yet submitted
    return out


class FHIRClaimListView(APIView):
    """GET /claims/ — list cached FHIR claims with optional filters."""

    PAYMENT_STATUSES = {"PENDING", "DONE", "ERROR"}

    def get(self, request):
        from ..repositories.fhir_repository import FHIRClaimRepository
        repo = FHIRClaimRepository()

        status_param = request.query_params.get("status", "")
        fhir_status_filter = None if status_param in self.PAYMENT_STATUSES else (status_param or None)

        qs = repo.list_claims(
            hospital_id=request.query_params.get("hospital_id"),
            status=fhir_status_filter,
            months=int(request.query_params.get("months", 3)),
        )
        last_sync = repo.last_sync()
        claims = list(qs.values(
            "id", "fhir_id", "claim_reference", "patient_name",
            "hospital_id", "hospital_name", "amount", "currency",
            "fhir_status", "service_date", "last_synced",
        ))

        # Annotate payment_status
        numeric_ids = {}
        for c in claims:
            try:
                numeric_ids[int(c["fhir_id"])] = c["id"]
            except (ValueError, TypeError):
                pass

        ps_map = _compute_payment_status(list(numeric_ids.keys())) if numeric_ids else {}
        for c in claims:
            try:
                c["payment_status"] = ps_map.get(int(c["fhir_id"]), "PENDING")
            except (ValueError, TypeError):
                c["payment_status"] = "PENDING"

        if status_param in self.PAYMENT_STATUSES:
            claims = [c for c in claims if c["payment_status"] == status_param]

        # Server-side pagination
        page_size = max(1, min(int(request.query_params.get("page_size", 20)), 200))
        page      = max(1, int(request.query_params.get("page", 1)))
        total     = len(claims)
        total_pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, total_pages)
        start = (page - 1) * page_size
        paginated = claims[start: start + page_size]

        return Response({
            "last_sync": last_sync,
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "claims": paginated,
        })


class HospitalListView(APIView):
    """GET /claims/hospitals/ — distinct hospitals from cached claims."""

    def get(self, request):
        from ..repositories.fhir_repository import FHIRClaimRepository
        raw = list(FHIRClaimRepository().hospitals())
        # Deduplicate: if same hospital_id appears with different names, keep first occurrence
        seen = {}
        for h in raw:
            if h["hospital_id"] not in seen:
                seen[h["hospital_id"]] = h
        return Response(list(seen.values()))


class BatchCreateView(APIView):
    """
    POST /batch/create
    Body: { claim_ids, batch_size?, submit_now? }
    batch_size  — max claims per batch (split per hospital). Default: all in one.
    submit_now  — true (default) = submit immediately to NCHL;
                  false = create PENDING batches for queue scheduling.
    """

    def post(self, request):
        claim_ids  = request.data.get("claim_ids", [])
        batch_size = request.data.get("batch_size")
        submit_now = request.data.get("submit_now", True)
        if not claim_ids:
            return Response({"error": "claim_ids list is required."}, status=status.HTTP_400_BAD_REQUEST)
        from ..services.batch_create_service import BatchCreateService
        try:
            summary = BatchCreateService().create_from_fhir_claims(
                claim_ids,
                batch_size=int(batch_size) if batch_size else None,
                submit_now=bool(submit_now),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "total_batches": summary.total_batches,
            "submitted": summary.submitted,
            "failed": summary.failed,
            "batches": [
                {
                    "hospital_id":    b.hospital_id,
                    "hospital_name":  b.hospital_name,
                    "batch_id":       b.batch_id,
                    "batch_number":   b.batch_number,
                    "claim_count":    b.claim_count,
                    "total_amount":   str(b.total_amount),
                    "status":         b.status,
                    "failure_reason": b.failure_reason,
                }
                for b in summary.batches
            ],
        }, status=status.HTTP_201_CREATED)


# ── Payment Queue Views ────────────────────────────────────────────────────────

class QueueListView(APIView):
    """GET /queue/ — list the payment queue in FIFO order."""

    def get(self, request):
        from ..models import PaymentQueue
        from django.db.models import Count, Sum
        entries = (
            PaymentQueue.objects
            .select_related("batch")
            .annotate(
                claim_count=Count("batch__items"),
                total_amount=Sum("batch__items__amount"),
            )
            .all()
        )
        data = [
            {
                "id":           e.id,
                "position":     e.position,
                "batch_id":     e.batch.id,
                "batch_number": e.batch.batch_number,
                "hospital":     e.batch.hospital_name or e.batch.hospital_id or "—",
                "hospital_id":  e.batch.hospital_id,
                "claim_count":  e.claim_count or 0,
                "total_amount": str(e.total_amount or 0),
                "batch_status": e.batch.status,
                "scheduled_at": e.scheduled_at.isoformat(),
                "status":       e.status,
                "executed_at":  e.executed_at.isoformat() if e.executed_at else None,
                "notes":        e.notes,
                "created_at":   e.created_at.isoformat(),
            }
            for e in entries
        ]
        return Response({"count": len(data), "queue": data})


class QueueEnqueueView(APIView):
    """POST /queue/add — add batches to the queue."""

    def post(self, request):
        batch_ids    = request.data.get("batch_ids", [])
        scheduled_at = request.data.get("scheduled_at")
        if not batch_ids or not scheduled_at:
            return Response({"error": "batch_ids and scheduled_at are required."}, status=status.HTTP_400_BAD_REQUEST)
        from ..services.queue_service import QueueService
        from django.utils.dateparse import parse_datetime
        from django.utils import timezone
        dt = parse_datetime(scheduled_at)
        if not dt:
            return Response({"error": "Invalid scheduled_at format. Use ISO 8601."}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt)
        try:
            result = QueueService().enqueue(batch_ids, dt)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"queued": result.total_queued}, status=status.HTTP_201_CREATED)


class QueueExecuteView(APIView):
    """POST /queue/execute — run all QUEUED entries that are due now."""

    def post(self, request):
        from ..services.queue_service import QueueService
        result = QueueService().execute_due()
        return Response({
            "executed": result.executed,
            "skipped":  result.skipped,
            "errors":   result.errors,
        })


class QueueCancelView(APIView):
    """POST /queue/{id}/cancel"""

    def post(self, request, queue_id):
        from ..services.queue_service import QueueService
        try:
            QueueService().cancel(queue_id)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"cancelled": queue_id})


class QueueMoveView(APIView):
    """POST /queue/{id}/move  body: { direction: "up"|"down" }"""

    def post(self, request, queue_id):
        direction = request.data.get("direction", "down")
        from ..services.queue_service import QueueService
        try:
            QueueService().move(queue_id, direction)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"moved": queue_id, "direction": direction})


class StatementPreviewView(APIView):
    """POST /statements/preview — parse a PDF/CSV and return fields without saving."""
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        file_type = request.data.get("type", "pdf").lower()
        parser = StatementParser()

        try:
            if file_type == "pdf":
                data = parser.preview_pdf(uploaded)
            else:
                rows = parser.parse_csv(uploaded)
                data = {
                    "format": "csv",
                    "rows": [
                        {
                            "claim_id": r.claim_id,
                            "transaction_id": r.transaction_id,
                            "amount": str(r.amount),
                            "status": r.status,
                            "settlement_date": str(r.settlement_date),
                        }
                        for r in rows
                    ],
                }
        except (ValueError, ImportError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)


class RunReconciliationView(APIView):
    """POST /reconciliation/run"""

    def post(self, request):
        ser = RunReconciliationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        claim_ids = ser.validated_data.get("claim_ids")

        service = ReconciliationService()
        summary = service.run(claim_ids=claim_ids)

        return Response(
            {
                "total_claims": summary.total_claims,
                "matched": summary.matched,
                "settlement_pending": summary.settlement_pending,
                "status_mismatch": summary.status_mismatch,
                "investigation_required": summary.investigation_required,
                "amount_mismatch": summary.amount_mismatch,
                "not_sent": summary.not_sent,
            },
            status=status.HTTP_200_OK,
        )


class StatementUploadView(APIView):
    """POST /statements/upload  (multipart, field: file, type: csv|pdf)"""
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        file_type = request.data.get("type", "csv").lower()
        claim_id_raw = request.data.get("claim_id", "").strip()
        claim_id = int(claim_id_raw) if claim_id_raw.isdigit() else None
        parser = StatementParser()

        try:
            if file_type == "pdf":
                rows = parser.parse_pdf(uploaded, claim_id=claim_id)
            else:
                rows = parser.parse_csv(uploaded)
        except (ValueError, ImportError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        import_batch = f"IMPORT-{uuid.uuid4().hex[:8].upper()}"
        row_dicts = [
            {
                "claim_id": r.claim_id,
                "transaction_id": r.transaction_id,
                "amount": r.amount,
                "status": r.status,
                "settlement_date": r.settlement_date,
            }
            for r in rows
        ]

        repo = BankStatementRepository()
        created = repo.bulk_create(row_dicts, import_batch)

        return Response(
            {"import_batch": import_batch, "rows_imported": len(created)},
            status=status.HTTP_201_CREATED,
        )


class ReconciliationResultsView(APIView):
    """GET /reconciliation/results"""

    def get(self, request):
        from ..repositories.reconciliation_repository import ReconciliationRepository
        records = ReconciliationRepository().get_all()
        ser = ReconciliationRecordSerializer(records, many=True)
        return Response(ser.data)


class ReconciliationFailedView(APIView):
    """GET /reconciliation/failed"""

    def get(self, request):
        from ..repositories.reconciliation_repository import ReconciliationRepository
        records = ReconciliationRepository().get_failed()
        ser = ReconciliationRecordSerializer(records, many=True)
        return Response(ser.data)


class DashboardSummaryView(APIView):
    """GET /dashboard/summary"""

    def get(self, request):
        data = DashboardQueries().summary()
        ser = DashboardSerializer(data)
        return Response(ser.data)


class BatchListView(APIView):
    """GET /batch/ — list all payment batches."""

    def get(self, request):
        from ..models import PaymentBatch, PaymentQueue
        from django.db.models import Count, Sum, Exists, OuterRef
        queued_batches = PaymentQueue.objects.filter(
            batch=OuterRef("pk"),
            status__in=["QUEUED", "EXECUTING"],
        )
        batches = (
            PaymentBatch.objects
            .filter(parent_batch__isnull=True)
            .annotate(
                claim_count=Count("items"),
                total_amount=Sum("items__amount"),
                in_queue=Exists(queued_batches),
            )
            .order_by("-created_at")
        )
        data = [
            {
                "id":            b.id,
                "batch_number":  b.batch_number,
                "hospital_id":   b.hospital_id,
                "hospital_name": b.hospital_name or b.hospital_id,
                "status":        b.status,
                "claim_count":   b.claim_count or 0,
                "total_amount":  str(b.total_amount or 0),
                "created_at":    b.created_at.isoformat(),
                "in_queue":      b.in_queue,
            }
            for b in batches
        ]
        return Response({"count": len(data), "batches": data})


class BatchAutoCreateView(APIView):
    """
    POST /batch/auto-create
    Body: { batch_size: 15, submit_now: false }

    Groups ALL unbatched FHIR claims by hospital, splits into chunks of batch_size,
    creates PENDING batches ready for queue scheduling.
    """

    def post(self, request):
        batch_size = int(request.data.get("batch_size", 15))
        submit_now = bool(request.data.get("submit_now", False))

        from ..models import FHIRClaim, PaymentItem
        # Find claim_ids already in a batch
        batched_ids = set(PaymentItem.objects.values_list("claim_id", flat=True))

        # All FHIRClaim rows not yet batched (fhir_id as int maps to claim_id)
        all_claims = list(FHIRClaim.objects.all())
        unbatched = [
            c for c in all_claims
            if c.fhir_id.isdigit() and int(c.fhir_id) not in batched_ids
        ]
        if not unbatched:
            return Response({"message": "All claims are already batched.", "total_batches": 0, "batches": []})

        fhir_ids = [c.id for c in unbatched]

        from ..services.batch_create_service import BatchCreateService
        try:
            summary = BatchCreateService().create_from_fhir_claims(
                fhir_ids,
                batch_size=batch_size,
                submit_now=submit_now,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "total_batches": summary.total_batches,
            "submitted":     summary.submitted,
            "failed":        summary.failed,
            "unbatched_claims": len(unbatched),
            "batches": [
                {
                    "hospital_id":   b.hospital_id,
                    "hospital_name": b.hospital_name,
                    "batch_id":      b.batch_id,
                    "batch_number":  b.batch_number,
                    "claim_count":   b.claim_count,
                    "total_amount":  str(b.total_amount),
                    "status":        b.status,
                }
                for b in summary.batches
            ],
        }, status=status.HTTP_201_CREATED)


class RetryBatchView(APIView):
    """POST /batch/retry"""

    def post(self, request):
        ser = RetryBatchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        batch_id = ser.validated_data["batch_id"]

        try:
            result = RetryService().create_retry_batch(batch_id)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "retry_batch_id": result.retry_batch_id,
                "retry_batch_number": result.retry_batch_number,
                "retried_claim_ids": result.retried_claim_ids,
            },
            status=status.HTTP_201_CREATED,
        )
