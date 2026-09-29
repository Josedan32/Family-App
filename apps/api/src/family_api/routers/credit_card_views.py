"""One way to turn a card and its derived figures into a response.

Both the member's own cards and another member's (at FULL visibility) read
through here, mirroring routers/debt_views.py.
"""

from family_api.db.models.credit_card import CreditCard, CreditCardStatement
from family_api.schemas.credit_card import CreditCardResponse, CreditCardStatementResponse


def statement_response(statement: CreditCardStatement) -> CreditCardStatementResponse:
    return CreditCardStatementResponse(
        id=statement.id,
        cycle_starts_on=statement.cycle_starts_on,
        cycle_ends_on=statement.cycle_ends_on,
        opening_balance_minor=statement.opening_balance_minor,
        purchases_total_minor=statement.purchases_total_minor,
        installments_due_minor=statement.installments_due_minor,
        interest_charged_minor=statement.interest_charged_minor,
        payments_total_minor=statement.payments_total_minor,
        closing_balance_minor=statement.closing_balance_minor,
        minimum_payment_minor=statement.minimum_payment_minor,
        payment_due_on=statement.payment_due_on,
    )


def credit_card_response(
    card: CreditCard,
    outstanding_minor: int,
    current_cycle_balance_minor: int,
    latest_statement: CreditCardStatement | None,
    currency: str,
) -> CreditCardResponse:
    return CreditCardResponse(
        id=card.id, nickname=card.nickname, bank_label=card.bank_label,
        credit_limit_minor=card.credit_limit_minor,
        interest_rate_monthly_pct=float(card.interest_rate_monthly_pct),
        minimum_payment_pct=float(card.minimum_payment_pct),
        minimum_payment_floor_minor=card.minimum_payment_floor_minor,
        statement_cutoff_day=card.statement_cutoff_day,
        payment_due_days=card.payment_due_days, status=card.status, currency=currency,
        outstanding_minor=outstanding_minor,
        current_cycle_balance_minor=current_cycle_balance_minor,
        latest_statement=statement_response(latest_statement) if latest_statement else None,
    )
