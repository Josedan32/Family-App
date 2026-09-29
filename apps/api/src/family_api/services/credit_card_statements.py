"""Pure credit-card statement math. No DB, no models, no I/O.

Everything here matches FR-M2-26 through FR-M2-30 of
docs/superpowers/specs/2026-09-28-credit-cards-design.md. Rate arithmetic
uses Decimal internally so nothing rounds through binary floating point;
every value that crosses back out is a plain int of minor units.
"""

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal

from family_api.dates import add_months


@dataclass(frozen=True)
class StatementFigures:
    interest_charged_minor: int
    closing_balance_minor: int
    minimum_payment_minor: int


def _round_pct(amount_minor: int, pct: Decimal) -> int:
    exact = Decimal(amount_minor) * pct / Decimal(100)
    return int(exact.to_integral_value(rounding=ROUND_HALF_UP))


def _ceil_pct(amount_minor: int, pct: Decimal) -> int:
    exact = Decimal(amount_minor) * pct / Decimal(100)
    return int(exact.to_integral_value(rounding=ROUND_CEILING))


def compute_statement(
    *,
    opening_balance_minor: int,
    purchases_total_minor: int,
    installments_due_minor: int,
    payments_total_minor: int,
    interest_rate_monthly_pct: Decimal,
    minimum_payment_pct: Decimal,
    minimum_payment_floor_minor: int | None,
) -> StatementFigures:
    """FR-M2-28 (interest), FR-M2-29 (minimum payment)."""
    interest_charged = _round_pct(opening_balance_minor, interest_rate_monthly_pct)
    closing_balance = max(
        opening_balance_minor
        + purchases_total_minor
        + installments_due_minor
        + interest_charged
        - payments_total_minor,
        0,
    )
    revolving_principal = max(closing_balance - installments_due_minor - interest_charged, 0)
    computed_minimum = (
        interest_charged
        + installments_due_minor
        + _ceil_pct(revolving_principal, minimum_payment_pct)
    )
    minimum_payment = computed_minimum
    if minimum_payment_floor_minor and closing_balance < minimum_payment_floor_minor:
        minimum_payment = max(minimum_payment_floor_minor, computed_minimum)
    if closing_balance == 0:
        minimum_payment = 0
    return StatementFigures(
        interest_charged_minor=interest_charged,
        closing_balance_minor=closing_balance,
        minimum_payment_minor=minimum_payment,
    )


def installment_due_in_cycle(
    *,
    installments_total: int,
    installment_amount_minor: int,
    first_installment_on: date,
    cycle_starts_on: date,
    cycle_ends_on: date,
) -> int:
    """The fixed due amount for one purchase's installment plan in one cycle.

    A due amount appears exactly once, in the cycle containing its scheduled
    date, regardless of whether earlier installments were paid (FR-M2-23).
    """
    for i in range(installments_total):
        due_on = add_months(first_installment_on, i)
        if cycle_starts_on <= due_on <= cycle_ends_on:
            return installment_amount_minor
    return 0


def _day_in_month(month_first: date, day: int) -> date:
    last_day = calendar.monthrange(month_first.year, month_first.month)[1]
    return month_first.replace(day=min(day, last_day))


def next_cutoff_on_or_after(cutoff_day: int, start: date) -> date:
    """The first cut-off date that is on or after `start`."""
    candidate = _day_in_month(start.replace(day=1), cutoff_day)
    if candidate < start:
        candidate = _day_in_month(add_months(start.replace(day=1), 1), cutoff_day)
    return candidate
