"""
Claim DTOs — contracts for FHIR claim data flow.

FHIRClaimDTO        : raw claim data fetched/cached from FHIR server
ClaimListItemDTO    : one row in the claims list (annotated with payment_status)
ClaimPageDTO        : paginated claims list response
HospitalDTO         : hospital summary entry
FHIRSyncResultDTO   : result of a FHIR sync operation
FetchClaimsCommand  : input to trigger FHIR sync (from HTTP or Celery task)
ClaimListQuery      : input to list/filter claims
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional


@dataclass(frozen=True)
class FetchClaimsCommand:
    """Input DTO: trigger a FHIR claim sync."""
    months: int = 3


@dataclass(frozen=True)
class ClaimListQuery:
    """Input DTO: filter/paginate the claims list."""
    hospital_id: Optional[str] = None
    status: Optional[str] = None          # FHIR status (active/cancelled)
    payment_status: Optional[str] = None  # PENDING/BATCHED/SUBMITTED/DONE/ERROR
    months: Optional[int] = None          # None = no date filter
    page: int = 1
    page_size: int = 20


@dataclass(frozen=True)
class FHIRClaimDTO:
    """Internal DTO: one claim from the FHIR server or local cache."""
    fhir_id: str
    claim_reference: str
    patient_name: str
    patient_ref: str
    hospital_id: str
    hospital_name: str
    amount: Decimal
    currency: str
    fhir_status: str
    service_date: Optional[date]
    id: Optional[int] = None
    last_synced: Optional[datetime] = None


@dataclass(frozen=True)
class ClaimListItemDTO:
    """Output DTO: one row in the paginated claims list, with payment_status."""
    id: int
    fhir_id: str
    claim_reference: str
    patient_name: str
    hospital_id: str
    hospital_name: str
    amount: Decimal
    currency: str
    fhir_status: str
    service_date: Optional[date]
    last_synced: Optional[datetime]
    payment_status: str  # PENDING | BATCHED | SUBMITTED | DONE | ERROR


@dataclass(frozen=True)
class ClaimPageDTO:
    """Output DTO: paginated response for the claims list endpoint."""
    claims: List[ClaimListItemDTO]
    count: int
    page: int
    page_size: int
    total_pages: int
    last_sync: Optional[datetime]


@dataclass(frozen=True)
class HospitalDTO:
    """Output DTO: hospital summary with claim counts."""
    hospital_id: str
    hospital_name: str
    claim_count: int
    total_amount: Decimal


@dataclass(frozen=True)
class FHIRSyncResultDTO:
    """Output DTO: result of a FHIR sync operation."""
    fetched: int
    created: int
    updated: int
    skipped: int
