from datetime import date

from family_api.services.savings import goal_state

TODAY = date(2026, 9, 17)


def test_goal_achieved_takes_priority_over_a_passed_deadline() -> None:
    """Balance already meets the target, even though target_date is in the past."""
    state, days_remaining, is_overdue = goal_state(
        balance_minor=100_000,
        target_amount_minor=80_000,
        target_date=date(2026, 1, 1),
        today=TODAY,
    )

    assert state == "completado"
    assert is_overdue is False
    assert days_remaining == (date(2026, 1, 1) - TODAY).days


def test_deadline_passed_and_goal_not_yet_achieved_is_overdue() -> None:
    state, days_remaining, is_overdue = goal_state(
        balance_minor=10_000,
        target_amount_minor=80_000,
        target_date=date(2026, 9, 1),
        today=TODAY,
    )

    assert state == "en_progreso"
    assert is_overdue is True
    assert days_remaining == -16


def test_in_progress_with_days_left() -> None:
    state, days_remaining, is_overdue = goal_state(
        balance_minor=10_000,
        target_amount_minor=80_000,
        target_date=date(2026, 10, 1),
        today=TODAY,
    )

    assert state == "en_progreso"
    assert is_overdue is False
    assert days_remaining == 14


def test_no_target_date_has_no_days_remaining_and_is_never_overdue() -> None:
    state, days_remaining, is_overdue = goal_state(
        balance_minor=10_000,
        target_amount_minor=80_000,
        target_date=None,
        today=TODAY,
    )

    assert state == "en_progreso"
    assert days_remaining is None
    assert is_overdue is False
