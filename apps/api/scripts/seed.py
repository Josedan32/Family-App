"""Build the Familia Hernández demo household from spec §1.1.

Run with `make seed` (`cd apps/api && python scripts/seed.py`). Idempotent: it
does nothing if the household exists.
"""

import asyncio

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import VisibilitySetting
from family_api.db.models.user import User
from family_api.db.session import get_session_factory
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services.households import create_household, seed_visibility

DEMO_PASSWORD = "correct-horse-battery"

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

    await session.flush()


async def main() -> None:
    factory = get_session_factory()
    async with factory() as session:
        await seed_demo_household(session)
        await session.commit()
    print("Seeded Familia Hernández. Password for every member:", DEMO_PASSWORD)


if __name__ == "__main__":
    asyncio.run(main())
