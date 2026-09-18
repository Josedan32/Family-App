"""One way to turn a debt and its derived figures into a response.

Both the member's own debts and another member's (at FULL visibility) read
through here, so the two can never disagree on what a field means.
"""

from family_api.db.models.debt import Debt
from family_api.schemas.debt import DebtResponse
from family_api.services.debts import DebtFigures


def debt_response(debt: Debt, figures: DebtFigures, currency: str) -> DebtResponse:
    installments = figures.installments
    paid = debt.principal_minor - figures.outstanding_minor
    return DebtResponse(
        id=debt.id, name=debt.name,
        creditor_type=debt.creditor_type, creditor_label=debt.creditor_label,
        principal_minor=debt.principal_minor, outstanding_minor=figures.outstanding_minor,
        paid_total_minor=paid,
        annual_interest_rate=float(debt.annual_interest_rate)
        if debt.annual_interest_rate is not None else None,
        due_day=debt.due_day, status=debt.status, currency=currency,
        installments_total=installments.total if installments else None,
        installments_paid=installments.paid if installments else None,
        installments_remaining=installments.remaining if installments else None,
        next_installment_on=installments.next_on if installments else None,
        next_installment_amount_minor=installments.next_amount_minor if installments else None,
        minimum_payment_minor=debt.minimum_payment_minor,
        is_overdue=installments.is_overdue if installments else None,
        standing=figures.standing.state,
        next_due_on=figures.standing.next_due_on,
        progress=paid / debt.principal_minor if debt.principal_minor else 0.0,
    )
