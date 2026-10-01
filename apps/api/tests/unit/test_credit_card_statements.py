from datetime import date
from decimal import Decimal

from family_api.services.credit_card_statements import (
    compute_statement,
    installment_due_in_cycle,
    next_cutoff_on_or_after,
)


def test_first_statement_charges_no_interest_on_zero_opening_balance() -> None:
    figures = compute_statement(
        opening_balance_minor=0,
        purchases_total_minor=100_000,
        installments_due_minor=0,
        payments_total_minor=0,
        interest_rate_monthly_pct=Decimal("2.5"),
        minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=None,
    )
    assert figures.interest_charged_minor == 0
    assert figures.closing_balance_minor == 100_000
    # revolving principal = 100_000
    # min = 0 (interest) + 0 (installments) + ceil(5% of 100000) = 5000
    assert figures.minimum_payment_minor == 5_000


def test_unpaid_balance_compounds_next_cycle() -> None:
    figures = compute_statement(
        opening_balance_minor=100_000,
        purchases_total_minor=0,
        installments_due_minor=0,
        payments_total_minor=0,
        interest_rate_monthly_pct=Decimal("2.5"),
        minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=None,
    )
    # interest = round(100_000 * 2.5 / 100) = 2500
    assert figures.interest_charged_minor == 2_500
    assert figures.closing_balance_minor == 102_500


def test_minimum_payment_floor_is_capped_at_the_closing_balance() -> None:
    figures = compute_statement(
        opening_balance_minor=0,
        purchases_total_minor=10_000,
        installments_due_minor=0,
        payments_total_minor=0,
        interest_rate_monthly_pct=Decimal("2.5"),
        minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=15_000,
    )
    # computed minimum would be ceil(5% of 10_000) = 500 and the floor 15_000,
    # but nobody is asked to pay more than they owe.
    assert figures.minimum_payment_minor == 10_000


def test_minimum_payment_floor_applies_on_a_balance_just_above_it() -> None:
    figures = compute_statement(
        opening_balance_minor=0,
        purchases_total_minor=20_000,
        installments_due_minor=0,
        payments_total_minor=0,
        interest_rate_monthly_pct=Decimal("2.5"),
        minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=15_000,
    )
    # computed minimum = ceil(5% of 20_000) = 1_000; the floor is below the balance.
    assert figures.minimum_payment_minor == 15_000


def test_a_zero_closing_balance_has_a_zero_minimum_even_with_a_floor() -> None:
    figures = compute_statement(
        opening_balance_minor=0,
        purchases_total_minor=10_000,
        installments_due_minor=0,
        payments_total_minor=10_000,
        interest_rate_monthly_pct=Decimal("2.5"),
        minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=15_000,
    )
    assert figures.closing_balance_minor == 0
    assert figures.minimum_payment_minor == 0


def test_minimum_payment_floor_applies_even_on_a_large_balance() -> None:
    figures = compute_statement(
        opening_balance_minor=1_000_000,
        purchases_total_minor=0,
        installments_due_minor=0,
        payments_total_minor=0,
        interest_rate_monthly_pct=Decimal("0"),
        minimum_payment_pct=Decimal("0.5"),
        minimum_payment_floor_minor=15_000,
    )
    # computed minimum = ceil(0.5% of 1_000_000) = 5_000, but the floor (15_000)
    # must win regardless of how large the balance is (FR-M2-29).
    assert figures.minimum_payment_minor == 15_000


def test_installment_dues_are_added_in_full_and_excluded_from_revolving_principal() -> None:
    figures = compute_statement(
        opening_balance_minor=0,
        purchases_total_minor=0,
        installments_due_minor=50_000,
        payments_total_minor=0,
        interest_rate_monthly_pct=Decimal("2.5"),
        minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=None,
    )
    assert figures.closing_balance_minor == 50_000
    # min payment = 0 interest + 50_000 installment + ceil(5% of 0 revolving) = 50_000
    assert figures.minimum_payment_minor == 50_000


def test_payments_reduce_closing_balance_and_never_go_negative() -> None:
    figures = compute_statement(
        opening_balance_minor=10_000,
        purchases_total_minor=0,
        installments_due_minor=0,
        payments_total_minor=50_000,
        interest_rate_monthly_pct=Decimal("2.5"),
        minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=None,
    )
    assert figures.closing_balance_minor == 0
    assert figures.minimum_payment_minor == 0


def test_installment_due_in_cycle_matches_only_its_own_month() -> None:
    assert installment_due_in_cycle(
        installments_total=3,
        installment_amount_minor=40_000,
        first_installment_on=date(2026, 1, 10),
        cycle_starts_on=date(2026, 2, 1),
        cycle_ends_on=date(2026, 2, 28),
    ) == 40_000


def test_installment_due_in_cycle_stops_after_last_installment() -> None:
    assert installment_due_in_cycle(
        installments_total=3,
        installment_amount_minor=40_000,
        first_installment_on=date(2026, 1, 10),
        cycle_starts_on=date(2026, 4, 1),
        cycle_ends_on=date(2026, 4, 30),
    ) == 0


def test_next_cutoff_same_month_when_day_not_yet_passed() -> None:
    assert next_cutoff_on_or_after(15, date(2026, 3, 1)) == date(2026, 3, 15)


def test_next_cutoff_rolls_to_next_month_when_day_already_passed() -> None:
    assert next_cutoff_on_or_after(15, date(2026, 3, 16)) == date(2026, 4, 15)


def test_next_cutoff_clamps_to_short_february() -> None:
    assert next_cutoff_on_or_after(28, date(2026, 2, 1)) == date(2026, 2, 28)
