from django.db import models


class BatchStatus(models.TextChoices):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    PARTIAL = "PARTIAL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ItemStatus(models.TextChoices):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    RETRY = "RETRY"


class ReconciliationResult(models.TextChoices):
    MATCHED = "MATCHED"
    SETTLEMENT_PENDING = "SETTLEMENT_PENDING"
    STATUS_MISMATCH = "STATUS_MISMATCH"
    INVESTIGATION_REQUIRED = "INVESTIGATION_REQUIRED"
    AMOUNT_MISMATCH = "AMOUNT_MISMATCH"
    NOT_SENT = "NOT_SENT"


class PaymentBatch(models.Model):
    batch_number = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=20, choices=BatchStatus.choices, default=BatchStatus.PENDING)
    parent_batch = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="retry_batches"
    )
    retry_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_batches"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Batch {self.batch_number} [{self.status}]"


class PaymentItem(models.Model):
    batch = models.ForeignKey(PaymentBatch, on_delete=models.CASCADE, related_name="items")
    claim_id = models.IntegerField(db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=ItemStatus.choices, default=ItemStatus.PENDING)
    gateway_reference = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_items"

    def __str__(self):
        return f"Claim {self.claim_id} | {self.amount} | {self.status}"


class SOSYSPaymentLog(models.Model):
    claim_id = models.IntegerField(db_index=True)
    gateway_reference = models.CharField(max_length=100, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20)
    response_payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sosys_payment_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"SOSYS | Claim {self.claim_id} | {self.status}"


class BankStatementRow(models.Model):
    claim_id = models.IntegerField(db_index=True)
    transaction_id = models.CharField(max_length=100, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20)
    settlement_date = models.DateField()
    import_batch = models.CharField(max_length=50, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bank_statement_rows"
        ordering = ["-settlement_date"]

    def __str__(self):
        return f"Bank | Claim {self.claim_id} | {self.transaction_id} | {self.status}"


class ReconciliationRecord(models.Model):
    claim_id = models.IntegerField(db_index=True)
    payment_item = models.ForeignKey(
        PaymentItem, null=True, blank=True, on_delete=models.SET_NULL, related_name="reconciliations"
    )
    gateway_status = models.CharField(max_length=20, blank=True, default="")
    bank_status = models.CharField(max_length=20, blank=True, default="")
    gateway_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    bank_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    result = models.CharField(max_length=30, choices=ReconciliationResult.choices)
    reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reconciliation_results"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Recon | Claim {self.claim_id} | {self.result}"
