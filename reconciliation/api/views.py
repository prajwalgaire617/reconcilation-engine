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
    PENDING = claim not yet sent, or sent to NCHL and awaiting bank settlement.
    DONE    = bank statement confirmed the payment (MATCHED).
    ERROR   = bank statement shows a problem or mismatch that needs action.
    """
    from ..models import PaymentItem, ReconciliationRecord
    DONE_RESULTS = {"MATCHED"}
    PENDING_RESULTS = {"SETTLEMENT_PENDING"}
    ERROR_RESULTS = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}

    item_exists = set(
        PaymentItem.objects.filter(claim_id__in=claim_ids).values_list("claim_id", flat=True)
    )
    recon_map = dict(
        ReconciliationRecord.objects.filter(claim_id__in=claim_ids)
        .order_by("-created_at")
        .values_list("claim_id", "result")
    )

    result = {}
    for cid in claim_ids:
        recon = recon_map.get(cid)
        if recon in DONE_RESULTS:
            result[cid] = "DONE"
        elif recon in ERROR_RESULTS:
            result[cid] = "ERROR"
        else:
            result[cid] = "PENDING"
    return result


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

        # Build payment_status for each claim
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

        return Response({"last_sync": last_sync, "count": len(claims), "claims": claims})


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
    """POST /batch/create — create batches from selected FHIR claim IDs."""

    def post(self, request):
        claim_ids = request.data.get("claim_ids", [])
        if not claim_ids:
            return Response({"error": "claim_ids list is required."}, status=status.HTTP_400_BAD_REQUEST)
        from ..services.batch_create_service import BatchCreateService
        try:
            summary = BatchCreateService().create_from_fhir_claims(claim_ids)
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
