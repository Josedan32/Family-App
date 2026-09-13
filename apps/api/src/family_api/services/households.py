from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import Category, VisibilitySetting
from family_api.db.models.user import User
from family_api.errors import AlreadyInHouseholdError
from family_api.ids import new_id
from family_api.services.chores import seed_chores

# FR-M2-01. Seeded data stays in the user's language (docs/glossary.md §6).
SEEDED_CATEGORIES: dict[str, tuple[str, ...]] = {
    "income": ("Salario", "Negocio", "Regalos", "Otros"),
    "expense": (
        "Transporte", "Comida", "Educación", "Entretenimiento", "Salud", "Otros",
    ),
}

# The category FR-M4-05 assigns to the expense a contribution generates.
CONTRIBUTION_CATEGORY = "Aporte al hogar"

# FR-M3-03. Debt is the most stigmatized financial fact in a family.
DEFAULT_VISIBILITY: dict[str, str] = {
    "income": "summary",
    "expenses": "summary",
    "savings": "summary",
    "debts": "private",
}


def seed_categories(session: AsyncSession, household: Household) -> None:
    for kind, names in SEEDED_CATEGORIES.items():
        for name in names:
            session.add(
                Category(
                    id=new_id(), household_id=household.id, kind=kind,
                    name=name, is_system=True,
                )
            )
    session.add(
        Category(
            id=new_id(), household_id=household.id, kind="expense",
            name=CONTRIBUTION_CATEGORY, is_system=True,
        )
    )


def seed_visibility(session: AsyncSession, member: HouseholdMember) -> None:
    for module, level in DEFAULT_VISIBILITY.items():
        session.add(
            VisibilitySetting(
                id=new_id(), household_id=member.household_id,
                member_id=member.id, module=module, level=level,
            )
        )


async def assert_not_in_household(session: AsyncSession, user: User) -> None:
    existing = await session.scalar(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    )
    if existing is not None:
        raise AlreadyInHouseholdError


async def create_household(
    session: AsyncSession,
    user: User,
    name: str,
    currency: str | None = None,
    timezone: str | None = None,
) -> tuple[Household, HouseholdMember]:
    await assert_not_in_household(session, user)
    settings = get_settings()

    household = Household(
        id=new_id(), name=name,
        currency=currency or settings.default_currency,
        timezone=timezone or settings.default_timezone,
        created_by=user.id,
    )
    session.add(household)
    await session.flush()

    member = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=user.id,
        role="admin", status="active",
    )
    session.add(member)
    await session.flush()

    seed_categories(session, household)
    seed_chores(session, household)
    seed_visibility(session, member)
    await session.flush()
    return household, member
