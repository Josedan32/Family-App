from datetime import date

import pytest

from family_api.periods import current_period, month_bounds, parse_period


def test_month_bounds_returns_first_and_last_day() -> None:
    assert month_bounds("2026-09") == (date(2026, 9, 1), date(2026, 9, 30))


def test_month_bounds_handles_february_in_a_leap_year() -> None:
    assert month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 2, 29))


def test_month_bounds_handles_december() -> None:
    assert month_bounds("2026-12") == (date(2026, 12, 1), date(2026, 12, 31))


@pytest.mark.parametrize("bad", ["2026", "2026-13", "26-09", "", "2026/09"])
def test_malformed_period_raises(bad: str) -> None:
    with pytest.raises(ValueError, match="Invalid period"):
        month_bounds(bad)


def test_current_period_uses_the_household_timezone() -> None:
    """L-11: 'this month' must mean what the family means by it."""
    period = current_period("America/Bogota")
    assert len(period) == 7
    assert period[4] == "-"


def test_parse_period_defaults_to_the_current_month() -> None:
    start, end = parse_period(None, "America/Bogota")
    assert start.day == 1
    assert end >= start
