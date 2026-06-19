"""
Management command: python manage.py fetch_fhir_claims [--months N]

Fetches claims from the FHIR R4 server and upserts them into the local
fhir_claims table. Designed to run nightly (off-peak) via cron:

    0 2 * * * /path/to/venv/bin/python manage.py fetch_fhir_claims --months 3

Do NOT run this during peak hours — FHIR fetch blocks on external I/O.
"""
from django.core.management.base import BaseCommand

from reconciliation.repositories.fhir_repository import FHIRApiClient, FHIRClaimRepository


class Command(BaseCommand):
    help = "Fetch claims from FHIR R4 and cache locally (run nightly, not during peak hours)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--months", type=int, default=3,
            help="How many months back to fetch (default: 3)"
        )

    def handle(self, *args, **options):
        months = options["months"]
        self.stdout.write(f"Fetching FHIR claims (last {months} months)…")

        try:
            dtos = FHIRApiClient().fetch_claims(months=months)
        except ConnectionError as exc:
            self.stderr.write(self.style.ERROR(f"FHIR fetch failed: {exc}"))
            return

        self.stdout.write(f"  Fetched {len(dtos)} claims from FHIR server.")

        result = FHIRClaimRepository().upsert_all(dtos)
        self.stdout.write(self.style.SUCCESS(
            f"  Created: {result['created']}  "
            f"Updated: {result['updated']}  "
            f"Skipped (zero amount): {result['skipped']}"
        ))
