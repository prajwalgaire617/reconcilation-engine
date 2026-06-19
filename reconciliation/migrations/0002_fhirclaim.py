from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reconciliation", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="FHIRClaim",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("fhir_id", models.CharField(db_index=True, max_length=100, unique=True)),
                ("claim_reference", models.CharField(blank=True, max_length=200)),
                ("patient_name", models.CharField(blank=True, max_length=200)),
                ("patient_ref", models.CharField(blank=True, max_length=200)),
                ("hospital_id", models.CharField(db_index=True, max_length=200)),
                ("hospital_name", models.CharField(blank=True, max_length=200)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("currency", models.CharField(default="NPR", max_length=10)),
                ("fhir_status", models.CharField(default="active", max_length=50)),
                ("service_date", models.DateField(blank=True, null=True)),
                ("fetched_at", models.DateTimeField(auto_now_add=True)),
                ("last_synced", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "fhir_claims", "ordering": ["-service_date", "hospital_id"]},
        ),
    ]
