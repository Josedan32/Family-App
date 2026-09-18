from typing import Literal

from pydantic import BaseModel


class MonthlySummaryResponse(BaseModel):
    """One number per composing module plus the derived remainder.

    This is inherently summary-shaped: it never carries a per-record field,
    so a single model serves both `/me/...` and `/members/{id}/...` — there
    is no detail variant to leak (docs/visibility-rules.md §3, §4.2).
    """

    period: str
    currency: str
    income_minor: int
    expenses_minor: int
    saved_minor: int
    debt_payments_minor: int
    remaining_minor: int
    status: Literal["healthy", "tight", "overspent"]
