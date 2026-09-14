from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Frequency = Literal["daily", "weekly", "biweekly", "monthly"]

# The catalogue is a short list of short lines (FR-M8-16). The caps are not
# arbitrary: they stop someone pasting a manual into a field that renders as a
# checklist on a phone.
MAX_CATALOGUE_ITEMS = 20
CatalogueList = list[str]


def _clean_catalogue(items: CatalogueList) -> CatalogueList:
    """Trim, drop blanks, and enforce the caps. Order is preserved."""
    cleaned = [item.strip() for item in items]
    cleaned = [item for item in cleaned if item]
    if len(cleaned) > MAX_CATALOGUE_ITEMS:
        raise ValueError(f"At most {MAX_CATALOGUE_ITEMS} items")
    if any(len(item) > 120 for item in cleaned):
        raise ValueError("Each item must be 120 characters or fewer")
    return cleaned


class CreateChoreRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = None
    frequency: Frequency
    effort_points: int = Field(ge=1, le=10)
    activities: CatalogueList = Field(default_factory=list)
    requirements: CatalogueList = Field(default_factory=list)
    expectation: str | None = Field(default=None, max_length=500)

    @field_validator("activities", "requirements")
    @classmethod
    def clean(cls, value: CatalogueList) -> CatalogueList:
        return _clean_catalogue(value)


class UpdateChoreRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    frequency: Frequency | None = None
    effort_points: int | None = Field(default=None, ge=1, le=10)
    activities: CatalogueList | None = None
    requirements: CatalogueList | None = None
    expectation: str | None = Field(default=None, max_length=500)

    @field_validator("activities", "requirements")
    @classmethod
    def clean(cls, value: CatalogueList | None) -> CatalogueList | None:
        return None if value is None else _clean_catalogue(value)


class ChoreResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    frequency: str
    effort_points: int
    activities: CatalogueList
    requirements: CatalogueList
    expectation: str | None
    archived_at: datetime | None


class AssignmentResponse(BaseModel):
    id: UUID
    chore_id: UUID
    chore_name: str
    # Carried on the assignment so the checklist is there while you do the
    # chore, without a second round trip to /chores.
    chore_activities: CatalogueList
    chore_requirements: CatalogueList
    chore_expectation: str | None
    member_id: UUID
    member_name: str
    due_on: date
    status: str
    effort_points: int
    completed_at: datetime | None
    completed_by_member_id: UUID | None


class CreateCycleRequest(BaseModel):
    starts_on: date
    ends_on: date


class CycleResponse(BaseModel):
    id: UUID
    starts_on: date
    ends_on: date
    # Drives the wheel's animation so every viewer sees the identical spin.
    seed: int
    assignments: list[AssignmentResponse]


class ReassignRequest(BaseModel):
    member_id: UUID


class CreateAbsenceRequest(BaseModel):
    starts_on: date
    ends_on: date
    reason: str | None = None


class AbsenceResponse(BaseModel):
    id: UUID
    member_id: UUID
    starts_on: date
    ends_on: date
    reason: str | None


class CreateAdjustmentRequest(BaseModel):
    member_id: UUID
    points: int
    # Required: an unexplained adjustment to a fairness ledger is
    # indistinguishable from favouritism.
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("points")
    @classmethod
    def _points_nonzero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("points must not be zero")
        return value


class EffortBalanceRow(BaseModel):
    member_id: UUID
    display_name: str
    effort_points: int
    completed_count: int
    pending_count: int
    # Household-visible (FR-M8-15): whoever is away, everyone sees when they
    # are due back, not just the absent member themselves.
    absent_until: date | None


class EffortBalancesResponse(BaseModel):
    window_days: int
    window_start: date
    members: list[EffortBalanceRow]
