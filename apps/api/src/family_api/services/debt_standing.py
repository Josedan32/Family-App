"""Where a debt stands today: paid, overdue, due soon or up to date.

Derived on every read, never stored — like installments, a stored standing
would drift the moment a payment is added, edited or deleted.

Two sources of a due date, in order:
- an installment plan: the next unpaid installment's date;
- a monthly cut-off day: this month's, unless a payment was already
  recorded this month (then next month's). A debt created after this month's
  cut-off owes nothing until next month's.
A debt with neither has no date to miss, so it is always up to date.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from typing import Literal

from family_api.dates import add_months

Standing = Literal["paid", "overdue", "due_soon", "up_to_date", "cancelled"]

# How close a due date has to be to warn about it.
DUE_SOON_DAYS = 5


@dataclass(frozen=True)
class DebtStanding:
    state: Standing
    next_due_on: date | None


def _due_in_month(month: date, due_day: int) -> date:
    last_day = monthrange(month.year, month.month)[1]
    return month.replace(day=min(due_day, last_day))


def _by_date(next_due_on: date, today: date) -> DebtStanding:
    if next_due_on < today:
        return DebtStanding("overdue", next_due_on)
    if (next_due_on - today).days <= DUE_SOON_DAYS:
        return DebtStanding("due_soon", next_due_on)
    return DebtStanding("up_to_date", next_due_on)


def debt_standing(
    *,
    status: str,
    outstanding_minor: int,
    due_day: int | None,
    installment_next_on: date | None,
    created_on: date,
    last_paid_on: date | None,
    today: date,
) -> DebtStanding:
    if status == "cancelled":
        return DebtStanding("cancelled", None)
    if status == "paid" or outstanding_minor <= 0:
        return DebtStanding("paid", None)

    if installment_next_on is not None:
        return _by_date(installment_next_on, today)

    if due_day is None:
        return DebtStanding("up_to_date", None)

    month = today.replace(day=1)
    this_month = _due_in_month(month, due_day)
    paid_this_month = last_paid_on is not None and last_paid_on >= month
    if paid_this_month or created_on > this_month:
        return _by_date(_due_in_month(add_months(month, 1), due_day), today)
    return _by_date(this_month, today)
