"""Household scoping applied in exactly one place (INV-D-03).

Every finance query goes through a subclass, so the scoping filter cannot be
forgotten in an individual query.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import Select, select


class HouseholdScopedRepository:
    model: Any

    def __init__(self, household_id: UUID) -> None:
        self.household_id = household_id

    def query(self) -> Select[Any]:
        return select(self.model).where(self.model.household_id == self.household_id)
