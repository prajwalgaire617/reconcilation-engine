from rest_framework import serializers


class PaymentItemSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    claim_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    status = serializers.CharField(max_length=20)
    gateway_reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    created_at = serializers.DateTimeField(read_only=True)


class PaymentBatchSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    batch_number = serializers.CharField(max_length=50)
    status = serializers.CharField(max_length=20)
    retry_count = serializers.IntegerField()
    parent_batch_id = serializers.IntegerField(required=False, allow_null=True)
    items = PaymentItemSerializer(many=True, read_only=True)
    created_at = serializers.DateTimeField(read_only=True)


class SOSYSLogSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    claim_id = serializers.IntegerField()
    gateway_reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    status = serializers.CharField(max_length=20)
    response_payload = serializers.JSONField()
    created_at = serializers.DateTimeField(read_only=True)


class BankStatementRowSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    claim_id = serializers.IntegerField()
    transaction_id = serializers.CharField(max_length=100)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    status = serializers.CharField(max_length=20)
    settlement_date = serializers.DateField()
    import_batch = serializers.CharField(max_length=50, required=False, allow_blank=True)


class ReconciliationRecordSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    claim_id = serializers.IntegerField()
    gateway_status = serializers.CharField(max_length=20, required=False, allow_blank=True)
    bank_status = serializers.CharField(max_length=20, required=False, allow_blank=True)
    gateway_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    bank_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    result = serializers.CharField(max_length=30)
    reason = serializers.CharField(required=False, allow_blank=True)
    created_at = serializers.DateTimeField(read_only=True)


class RunReconciliationSerializer(serializers.Serializer):
    claim_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=None)


class RetryBatchSerializer(serializers.Serializer):
    batch_id = serializers.IntegerField()


class DashboardSerializer(serializers.Serializer):
    total_claims       = serializers.IntegerField()
    batched_claims     = serializers.IntegerField()
    reconciled_claims  = serializers.IntegerField()
    total_amount       = serializers.DecimalField(max_digits=14, decimal_places=2)
    successful_payments = serializers.IntegerField()
    failed_payments    = serializers.IntegerField()
    pending_settlements = serializers.IntegerField()
    amount_mismatches  = serializers.IntegerField()
    retry_count        = serializers.IntegerField()
    pending_batches    = serializers.IntegerField()
    reconciliation_rate = serializers.FloatField()
    months_filter      = serializers.IntegerField()
