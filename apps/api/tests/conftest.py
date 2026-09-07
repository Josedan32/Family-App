from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.user import User
from family_api.db.session import engine_for, get_session, session_factory_for
from family_api.ids import new_id
from family_api.main import create_app
from family_api.security.passwords import hash_password


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Each test runs in a transaction that is rolled back at teardown."""
    engine = engine_for(get_settings().test_database_url)
    connection = await engine.connect()
    transaction = await connection.begin()
    factory = session_factory_for(engine)
    session = factory(bind=connection)

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
def make_user(db_session: AsyncSession):
    """Factory building a valid user. Tests name only the fields they care about."""

    async def _make(
        email: str = "daniel@example.com",
        password: str = "correct-horse-battery",
        display_name: str = "Daniel",
    ) -> User:
        user = User(
            id=new_id(),
            email=email,
            password_hash=hash_password(password),
            display_name=display_name,
        )
        db_session.add(user)
        await db_session.flush()
        return user

    return _make


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> None:
    from family_api.ratelimit import reset_rate_limits

    reset_rate_limits()


@pytest_asyncio.fixture
async def seeded_invite():
    """Committed household + invite + two candidate joiners, cleaned up after."""
    from datetime import UTC, datetime, timedelta

    from family_api.db.models.household import Household, HouseholdMember, InviteCode
    from family_api.db.models.seeded import Category, VisibilitySetting
    from family_api.services.households import create_household

    engine = engine_for(get_settings().test_database_url)
    factory = session_factory_for(engine)

    async with factory() as session:
        admin = User(
            id=new_id(), email="admin-conc@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name="Admin",
        )
        session.add(admin)
        await session.flush()
        household, member = await create_household(session, admin, "Concurrency")

        invite = InviteCode(
            id=new_id(), household_id=household.id, code="ABCDEFGH",
            role_granted="adult", expires_at=datetime.now(UTC) + timedelta(days=7),
            max_uses=1, uses=0, created_by=member.id,
        )
        session.add(invite)

        joiners = []
        for i in range(2):
            u = User(
                id=new_id(), email=f"joiner{i}-conc@example.com",
                password_hash=hash_password("correct-horse-battery"),
                display_name=f"Joiner {i}",
            )
            session.add(u)
            joiners.append(u.id)
        await session.commit()
        household_id = household.id

    yield "ABCDEFGH", joiners

    async with factory() as session:
        await session.execute(delete(VisibilitySetting).where(
            VisibilitySetting.household_id == household_id))
        # invite_codes.created_by references household_members, so it must go first.
        await session.execute(delete(InviteCode).where(
            InviteCode.household_id == household_id))
        await session.execute(delete(HouseholdMember).where(
            HouseholdMember.household_id == household_id))
        await session.execute(delete(Category).where(Category.household_id == household_id))
        await session.execute(delete(Household).where(Household.id == household_id))
        await session.execute(delete(User).where(User.id.in_([admin.id, *joiners])))
        await session.commit()
    await engine.dispose()
