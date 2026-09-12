from datetime import date

from family_api.services.installments import compute_installments

TODAY = date(2026, 12, 20)


def test_a_debt_without_a_plan_has_no_figures() -> None:
    assert compute_installments(None, None, None, 0, TODAY) is None


def test_nothing_paid_yet() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 0, TODAY)
    assert figures is not None
    assert figures.paid == 0
    assert figures.remaining == 12
    assert figures.next_on == date(2026, 10, 15)
    assert figures.next_amount_minor == 100_000


def test_two_installments_paid() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 200_000, TODAY)
    assert figures is not None
    assert figures.paid == 2
    assert figures.remaining == 10
    assert figures.next_on == date(2026, 12, 15)


def test_a_partial_payment_does_not_advance_the_schedule() -> None:
    """Half a cuota is not a cuota. Rounding down keeps the debt honest."""
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 150_000, TODAY)
    assert figures is not None
    assert figures.paid == 1


def test_overdue_when_the_next_date_has_passed() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 100_000, TODAY)
    assert figures is not None
    assert figures.next_on == date(2026, 11, 15)
    assert figures.is_overdue is True


def test_not_overdue_when_the_next_date_is_ahead() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 300_000, TODAY)
    assert figures is not None
    assert figures.is_overdue is False


def test_a_fully_paid_plan_has_no_next_installment() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 1_200_000, TODAY)
    assert figures is not None
    assert figures.remaining == 0
    assert figures.next_on is None
    assert figures.is_overdue is False


def test_overpayment_never_reports_more_than_the_total() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 9_999_999, TODAY)
    assert figures is not None
    assert figures.paid == 12
    assert figures.remaining == 0
