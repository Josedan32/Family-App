"""Build the Familia Hernández demo household from spec §1.1.

Run with `make seed` (`cd apps/api && python scripts/seed.py`). Idempotent: it
does nothing if the household exists.
"""

import asyncio
import random
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreAssignment
from family_api.db.models.contribution import ContributionPeriod, ContributionPledge
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import Category, VisibilitySetting
from family_api.db.models.user import User
from family_api.db.session import get_session_factory
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services.assignment import generate_cycle
from family_api.services.contributions import record_contribution
from family_api.services.household_expenses import create_expense
from family_api.services.households import create_household, seed_visibility

DEMO_PASSWORD = "correct-horse-battery"

# Spec §6.4: meta $2.000.000, recaudado $1.900.000, 95%.
CONTRIBUTIONS = {
    "Papá": (1_000_000, 1_000_000),   # (pledged, contributed)
    "Mamá": (600_000, 600_000),
    "Daniel": (400_000, 300_000),
}

MEMBERS = [
    ("papa@example.com", "Papá", "adult", "Padre"),
    ("mama@example.com", "Mamá", "adult", "Madre"),
    ("hermano@example.com", "Hermano", "teen", "Hermano"),
]

# Mixed on purpose: every level is represented so all three render paths
# are exercised the first time the app is opened.
DEMO_VISIBILITY = {
    "Papá": {
        "income": "summary", "expenses": "summary", "savings": "public", "debts": "private",
    },
    "Mamá": {
        "income": "public", "expenses": "public", "savings": "public", "debts": "summary",
    },
    "Hermano": {
        "income": "private", "expenses": "private", "savings": "private", "debts": "private",
    },
}


async def seed_demo_household(session: AsyncSession) -> None:
    existing = await session.scalar(
        select(Household).where(Household.name == "Familia Hernández")
    )
    if existing is not None:
        return

    daniel = User(
        id=new_id(), email="daniel@example.com",
        password_hash=hash_password(DEMO_PASSWORD), display_name="Daniel",
    )
    session.add(daniel)
    await session.flush()

    household, admin_member = await create_household(session, daniel, "Familia Hernández")
    admin_member.relationship = "Hijo"

    for email, name, role, relationship in MEMBERS:
        user = User(
            id=new_id(), email=email,
            password_hash=hash_password(DEMO_PASSWORD), display_name=name,
        )
        session.add(user)
        await session.flush()

        member = HouseholdMember(
            id=new_id(), household_id=household.id, user_id=user.id,
            role=role, relationship=relationship, status="active",
        )
        session.add(member)
        await session.flush()
        seed_visibility(session, member)
        await session.flush()

        for module, level in DEMO_VISIBILITY[name].items():
            await session.execute(
                update(VisibilitySetting)
                .where(
                    VisibilitySetting.member_id == member.id,
                    VisibilitySetting.module == module,
                )
                .values(level=level)
            )

    period = ContributionPeriod(
        id=new_id(), household_id=household.id,
        period_month=date.today().replace(day=1),
        goal_amount_minor=2_000_000, status="open",
    )
    session.add(period)
    await session.flush()

    all_members = (
        await session.execute(
            select(HouseholdMember, User)
            .join(User, User.id == HouseholdMember.user_id)
            .where(HouseholdMember.household_id == household.id)
        )
    ).all()

    for seeded_member, seeded_user in all_members:
        entry = CONTRIBUTIONS.get(seeded_user.display_name)
        if entry is None:
            continue
        pledged, contributed = entry
        session.add(
            ContributionPledge(
                id=new_id(), household_id=household.id, period_id=period.id,
                member_id=seeded_member.id, expected_amount_minor=pledged,
            )
        )
        await session.flush()
        # Goes through the service, so the mirror is exercised by the seed too.
        await record_contribution(
            session, seeded_member, period.id, contributed,
            date.today(), "Aporte del mes",
        )

    otros = await session.scalar(
        select(Category).where(
            Category.household_id == household.id,
            Category.kind == "expense",
            Category.name == "Otros",
        )
    )
    comida = await session.scalar(
        select(Category).where(
            Category.household_id == household.id,
            Category.kind == "expense",
            Category.name == "Comida",
        )
    )

    # Pot-funded: rent, paid from the collected money.
    await create_expense(
        session, admin_member, otros.id, 1_200_000, date.today(),
        "Arriendo", "pot", None, False,
    )

    # Member-funded and in kind: Mamá paid the groceries herself, and it counts
    # as her contribution. Exercises all three rows in one go.
    mama_member = await session.scalar(
        select(HouseholdMember)
        .join(User, User.id == HouseholdMember.user_id)
        .where(
            HouseholdMember.household_id == household.id,
            User.display_name == "Mamá",
        )
    )
    await create_expense(
        session, mama_member, comida.id, 250_000, date.today(),
        "Mercado de la semana", "member", mama_member.id, False,
    )

    today = date.today()
    cycle = await generate_cycle(
        session, admin_member,
        today.replace(day=1), today.replace(day=1) + timedelta(days=27),
        rng=random.Random(42),
    )

    assignments = (
        await session.scalars(
            select(ChoreAssignment).where(ChoreAssignment.cycle_id == cycle.id)
        )
    ).all()
    for assignment in assignments[: len(assignments) // 2]:
        assignment.status = "done"
        assignment.completed_at = datetime.now(UTC)
        assignment.completed_by_member_id = assignment.member_id
    await session.flush()


async def main() -> None:
    factory = get_session_factory()
    async with factory() as session:
        await seed_demo_household(session)
        await session.commit()
    print("Seeded Familia Hernández. Password for every member:", DEMO_PASSWORD)


if __name__ == "__main__":
    asyncio.run(main())
