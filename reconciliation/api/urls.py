from django.urls import path
from .views import (
    BatchAutoCreateView,
    BatchCreateView,
    BatchListView,
    DashboardSummaryView,
    FHIRClaimFetchView,
    FHIRClaimListView,
    HospitalListView,
    QueueCancelView,
    QueueEnqueueView,
    QueueExecuteView,
    QueueListView,
    QueueMoveView,
    ReconciliationFailedView,
    ReconciliationResultsView,
    RetryBatchView,
    RunReconciliationView,
    StatementPreviewView,
    StatementUploadView,
)

urlpatterns = [
    # Reconciliation
    path("reconciliation/run",     RunReconciliationView.as_view(),     name="reconciliation-run"),
    path("reconciliation/results", ReconciliationResultsView.as_view(), name="reconciliation-results"),
    path("reconciliation/failed",  ReconciliationFailedView.as_view(),  name="reconciliation-failed"),

    # Bank statement
    path("statements/upload",  StatementUploadView.as_view(),  name="statements-upload"),
    path("statements/preview", StatementPreviewView.as_view(), name="statements-preview"),

    # Dashboard
    path("dashboard/summary", DashboardSummaryView.as_view(), name="dashboard-summary"),

    # Batches
    path("batch/",            BatchListView.as_view(),        name="batch-list"),
    path("batch/create",      BatchCreateView.as_view(),      name="batch-create"),
    path("batch/auto-create", BatchAutoCreateView.as_view(),  name="batch-auto-create"),
    path("batch/retry",       RetryBatchView.as_view(),       name="batch-retry"),

    # FHIR claims
    path("claims/",           FHIRClaimListView.as_view(),  name="claims-list"),
    path("claims/fetch",      FHIRClaimFetchView.as_view(), name="claims-fetch"),
    path("claims/hospitals/", HospitalListView.as_view(),   name="claims-hospitals"),

    # Payment queue
    path("queue/",                      QueueListView.as_view(),    name="queue-list"),
    path("queue/add",                   QueueEnqueueView.as_view(), name="queue-add"),
    path("queue/execute",               QueueExecuteView.as_view(), name="queue-execute"),
    path("queue/<int:queue_id>/cancel", QueueCancelView.as_view(),  name="queue-cancel"),
    path("queue/<int:queue_id>/move",   QueueMoveView.as_view(),    name="queue-move"),
]
