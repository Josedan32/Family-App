from datetime import date

import pytest

from family_api.recurrence import occurrences


def test_daily_covers_every_day_inclusive() -> None:
    result = occurrences("daily", date(2026, 9, 1), date(2026, 9, 7))
    assert len(result) == 7
    assert result[0] == date(2026, 9, 1)
    assert result[-1] == date(2026, 9, 7)


def test_weekly_lands_once_per_week() -> None:
    result = occurrences("weekly", date(2026, 9, 1), date(2026, 9, 28))
    assert result == [
        date(2026, 9, 1), date(2026, 9, 8), date(2026, 9, 15), date(2026, 9, 22),
    ]


def test_biweekly_steps_fourteen_days() -> None:
    result = occurrences("biweekly", date(2026, 9, 1), date(2026, 10, 15))
    assert result == [date(2026, 9, 1), date(2026, 9, 15), date(2026, 9, 29),
                      date(2026, 10, 13)]


def test_monthly_keeps_the_day_of_month() -> None:
    result = occurrences("monthly", date(2026, 1, 15), date(2026, 4, 30))
    assert result == [
        date(2026, 1, 15), date(2026, 2, 15), date(2026, 3, 15), date(2026, 4, 15),
    ]


def test_monthly_clamps_in_short_months() -> None:
    result = occurrences("monthly", date(2026, 1, 31), date(2026, 3, 31))
    assert result == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)]


def test_a_single_day_range_yields_one_occurrence() -> None:
    assert occurrences("weekly", date(2026, 9, 1), date(2026, 9, 1)) == [
        date(2026, 9, 1)
    ]


def test_an_inverted_range_yields_nothing() -> None:
    assert occurrences("daily", date(2026, 9, 7), date(2026, 9, 1)) == []


def test_an_unknown_frequency_raises() -> None:
    with pytest.raises(ValueError, match="Unknown frequency"):
        occurrences("hourly", date(2026, 9, 1), date(2026, 9, 7))
