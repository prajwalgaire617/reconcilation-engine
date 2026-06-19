from django.contrib import admin
from .models import PaymentBatch, PaymentItem, SOSYSPaymentLog, BankStatementRow, ReconciliationRecord


@admin.register(PaymentBatch)
class PaymentBatchAdmin(admin.ModelAdmin):
    list_display = ("batch_number", "status", "retry_count", "parent_batch", "created_at")
    list_filter = ("status",)
    search_fields = ("batch_number",)


@admin.register(PaymentItem)
class PaymentItemAdmin(admin.ModelAdmin):
    list_display = ("claim_id", "batch", "amount", "status", "gateway_reference", "created_at")
    list_filter = ("status",)
    search_fields = ("claim_id", "gateway_reference")


@admin.register(SOSYSPaymentLog)
class SOSYSPaymentLogAdmin(admin.ModelAdmin):
    list_display = ("claim_id", "gateway_reference", "amount", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("claim_id", "gateway_reference")


@admin.register(BankStatementRow)
class BankStatementRowAdmin(admin.ModelAdmin):
    list_display = ("claim_id", "transaction_id", "amount", "status", "settlement_date")
    list_filter = ("status",)
    search_fields = ("claim_id", "transaction_id")


@admin.register(ReconciliationRecord)
class ReconciliationRecordAdmin(admin.ModelAdmin):
    list_display = ("claim_id", "result", "gateway_status", "bank_status", "gateway_amount", "bank_amount", "created_at")
    list_filter = ("result",)
    search_fields = ("claim_id",)
