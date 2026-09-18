from datetime import date

from family_api.services.debt_standing import debt_standing

TODAY = date(2026, 9, 18)


def standing(**overrides: object) -> tuple[str, date | None]:
    values: dict[str, object] = {
        "status": "active",
        "outstanding_minor": 500_000,
        "due_day": None,
        "installment_next_on": None,
        "created_on": date(2026, 1, 10),
        "last_paid_on": None,
        "today": TODAY,
    }
    values.update(overrides)
    result = debt_standing(**values)  # type: ignore[arg-type]
    return result.state, result.next_due_on


def test_a_paid_debt_is_paid() -> None:
    assert standing(status="paid", outstanding_minor=0) == ("paid", None)


def test_nothing_left_to_pay_is_paid_even_before_the_status_catches_up() -> None:
    assert standing(outstanding_minor=0) == ("paid", None)


def test_a_cancelled_debt_is_cancelled() -> None:
    assert standing(status="cancelled") == ("cancelled", None)


def test_an_installment_past_its_date_is_overdue() -> None:
    assert standing(installment_next_on=date(2026, 9, 16)) == ("overdue", date(2026, 9, 16))


def test_an_installment_within_five_days_is_due_soon() -> None:
    assert standing(installment_next_on=date(2026, 9, 22)) == ("due_soon", date(2026, 9, 22))


def test_an_installment_further_out_is_up_to_date() -> None:
    assert standing(installment_next_on=date(2026, 10, 16)) == ("up_to_date", date(2026, 10, 16))


def test_a_due_day_already_passed_with_no_payment_this_month_is_overdue() -> None:
    assert standing(due_day=5, last_paid_on=date(2026, 8, 5)) == ("overdue", date(2026, 9, 5))


def test_a_payment_this_month_moves_the_next_due_date_to_next_month() -> None:
    assert standing(due_day=5, last_paid_on=date(2026, 9, 3)) == ("up_to_date", date(2026, 10, 5))


def test_a_due_day_coming_up_within_five_days_is_due_soon() -> None:
    assert standing(due_day=20) == ("due_soon", date(2026, 9, 20))


def test_a_debt_created_after_this_months_due_day_is_not_overdue_yet() -> None:
    # Registered on the 10th with the cut-off on the 5th: the first payment is
    # next month's, and nothing has been missed.
    assert standing(due_day=5, created_on=date(2026, 9, 10)) == ("up_to_date", date(2026, 10, 5))


def test_a_due_day_past_the_end_of_a_short_month_falls_on_its_last_day() -> None:
    assert standing(due_day=31, today=date(2027, 2, 20)) == ("up_to_date", date(2027, 2, 28))


def test_with_no_plan_and_no_due_day_there_is_nothing_to_miss() -> None:
    assert standing() == ("up_to_date", None)
