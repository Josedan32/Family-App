"""Composes the already-existing per-module totals into one monthly figure.

No SQL lives here — it calls `transactions.total_for`, `savings.
deposits_in_period` and `debts.payments_in_period` and does integer
arithmetic on their results. Status thresholds per Task 15's ruling:
`overspent` when remaining is negative, `tight` when remaining is under 10%
of income, `healthy` otherwise; a zero-income period is `overspent` only if
something was spent, saved or paid, else `healthy`.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from family_api.services import debts as debt_service
from family_api.services import savings as savings_service
from family_api.services import transactions as transaction_service

Status = Literal["healthy", "tight", "overspent"]


@dataclass(frozen=True)
class MonthlySummaryFigures:
    income_minor: int
    expenses_minor: int
    saved_minor: int
    debt_payments_minor: int
    remaining_minor: int
    status: Status


def _status(
    income_minor: int,
    expenses_minor: int,
    saved_minor: int,
    debt_payments_minor: int,
    remaining_minor: int,
) -> Status:
    if income_minor == 0:
        spent_anything = expenses_minor + saved_minor + debt_payments_minor > 0
        return "overspent" if spent_anything else "healthy"
    if remaining_minor < 0:
        return "overspent"
    # Integer form of `remaining_minor < 0.1 * income_minor` — money is never
    # a float, not even inside a comparison.
    if remaining_minor * 10 < income_minor:
        return "tight"
    return "healthy"


async def monthly_summary(
    session: AsyncSession, member_id: UUID, start: date, end: date
) -> MonthlySummaryFigures:
    income = await transaction_service.total_for(session, member_id, "income", start, end)
    expenses = await transaction_service.total_for(session, member_id, "expense", start, end)
    saved = await savings_service.deposits_in_period(session, member_id, start, end)
    debt_payments = await debt_service.payments_in_period(session, member_id, start, end)
    remaining = income - expenses - saved - debt_payments
    return MonthlySummaryFigures(
        income_minor=income,
        expenses_minor=expenses,
        saved_minor=saved,
        debt_payments_minor=debt_payments,
        remaining_minor=remaining,
        status=_status(income, expenses, saved, debt_payments, remaining),
    )
