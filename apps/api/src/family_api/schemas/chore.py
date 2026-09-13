from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Frequency = Literal["daily", "weekly", "biweekly", "monthly"]


class CreateChoreRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = None
    frequency: Frequency
    effort_points: int = Field(ge=1, le=10)


class UpdateChoreRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    frequency: Frequency | None = None
    effort_points: int | None = Field(default=None, ge=1, le=10)


class ChoreResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    frequency: str
    effort_points: int
    archived_at: datetime | None


class AssignmentResponse(BaseModel):
    id: UUID
    chore_id: UUID
    chore_name: str
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


class EffortBalancesResponse(BaseModel):
    window_days: int
    window_start: date
    members: list[EffortBalanceRow]
