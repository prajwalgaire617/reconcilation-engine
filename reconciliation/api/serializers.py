from rest_framework import serializers
from ..models import PaymentBatch, PaymentItem, SOSYSPaymentLog, BankStatementRow, ReconciliationRecord


class PaymentItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentItem
        fields = ["id", "claim_id", "amount", "status", "gateway_reference", "created_at"]


class PaymentBatchSerializer(serializers.ModelSerializer):
    items = PaymentItemSerializer(many=True, read_only=True)

    class Meta:
        model = PaymentBatch
        fields = ["id", "batch_number", "status", "retry_count", "parent_batch", "items", "created_at"]


class SOSYSLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOSYSPaymentLog
        fields = ["id", "claim_id", "gateway_reference", "amount", "status", "response_payload", "created_at"]


class BankStatementRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankStatementRow
        fields = ["id", "claim_id", "transaction_id", "amount", "status", "settlement_date", "import_batch"]


class ReconciliationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReconciliationRecord
        fields = [
            "id", "claim_id", "gateway_status", "bank_status",
            "gateway_amount", "bank_amount", "result", "reason", "created_at",
        ]


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
