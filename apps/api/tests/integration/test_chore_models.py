import pytest

from family_api.db.models.chore import (
    Chore, ChoreAssignment, ChoreCycle, EffortAdjustment, MemberAbsence,
)


def test_effort_points_are_bounded_one_to_ten() -> None:
    names = {c.name for c in Chore.__table__.constraints if c.name}
    assert "ck_chore_effort_range" in names


def test_an_assignment_freezes_its_effort_weight() -> None:
    """FR-M8-04 / INV-D-10: re-pricing never rewrites history."""
    column = ChoreAssignment.__table__.columns["effort_points"]
    assert column.nullable is False


def test_completion_credits_whoever_actually_did_it() -> None:
    """FR-M8-11."""
    assert "completed_by_member_id" in ChoreAssignment.__table__.columns


def test_done_and_completed_at_move_together() -> None:
    names = {c.name for c in ChoreAssignment.__table__.constraints if c.name}
    assert "ck_assignment_completed_at" in names


def test_a_cycle_is_generated_once_per_start_date() -> None:
    uniques = [
        c for c in ChoreCycle.__table__.constraints
        if c.__class__.__name__ == "UniqueConstraint"
    ]
    assert any(
        {col.name for col in c.columns} == {"household_id", "starts_on"} for c in uniques
    )


def test_an_absence_range_is_ordered() -> None:
    names = {c.name for c in MemberAbsence.__table__.constraints if c.name}
    assert "ck_absence_range" in names


def test_an_effort_adjustment_requires_a_reason() -> None:
    """C-12: an unexplained adjustment is indistinguishable from favouritism."""
    assert EffortAdjustment.__table__.columns["reason"].nullable is False


def test_no_stored_effort_balance_exists() -> None:
    from family_api.db.models.household import HouseholdMember

    assert "effort_balance" not in HouseholdMember.__table__.columns
    assert "effort_points" not in HouseholdMember.__table__.columns


def test_households_carry_the_effort_window() -> None:
    from family_api.db.models.household import Household

    assert "effort_window_days" in Household.__table__.columns
