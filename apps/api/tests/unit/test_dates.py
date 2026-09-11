from datetime import date

import pytest

from family_api.dates import add_months


def test_adds_within_the_same_year() -> None:
    assert add_months(date(2026, 1, 15), 2) == date(2026, 3, 15)


def test_rolls_over_the_year() -> None:
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)


def test_clamps_to_the_last_day_of_a_shorter_month() -> None:
    """A debt due on the 31st is due on the 28th in February, not in March."""
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


def test_clamps_correctly_in_a_leap_year() -> None:
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)


def test_zero_months_is_identity() -> None:
    assert add_months(date(2026, 9, 3), 0) == date(2026, 9, 3)


@pytest.mark.parametrize("months", [1, 6, 12, 24])
def test_never_skips_a_month(months: int) -> None:
    start = date(2026, 3, 30)
    result = add_months(start, months)
    expected_month = (start.month - 1 + months) % 12 + 1
    assert result.month == expected_month
