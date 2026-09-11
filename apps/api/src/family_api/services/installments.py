"""Derived installment figures.

Nothing here is stored (FR-M2-18). `installments_paid` as a column would drift
the moment someone edits or deletes a payment, and the drift would be silent.
"""

from dataclasses import dataclass
from datetime import date

from family_api.dates import add_months


@dataclass(frozen=True)
class InstallmentFigures:
    total: int
    paid: int
    remaining: int
    next_on: date | None
    next_amount_minor: int | None
    is_overdue: bool


def compute_installments(
    installments_total: int | None,
    installment_amount_minor: int | None,
    first_installment_on: date | None,
    paid_total_minor: int,
    today: date,
) -> InstallmentFigures | None:
    """Return None for a debt with no plan — that is valid (FR-M2-19)."""
    if (
        installments_total is None
        or installment_amount_minor is None
        or first_installment_on is None
    ):
        return None

    # Floor: half a cuota is not a cuota.
    paid = min(paid_total_minor // installment_amount_minor, installments_total)
    remaining = installments_total - paid

    if remaining == 0:
        return InstallmentFigures(
            total=installments_total, paid=paid, remaining=0,
            next_on=None, next_amount_minor=None, is_overdue=False,
        )

    next_on = add_months(first_installment_on, paid)
    return InstallmentFigures(
        total=installments_total,
        paid=paid,
        remaining=remaining,
        next_on=next_on,
        next_amount_minor=installment_amount_minor,
        is_overdue=next_on < today,
    )
