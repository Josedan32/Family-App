from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.user import User
from family_api.db.session import engine_for, get_session, session_factory_for
from family_api.ids import new_id
from family_api.main import create_app

# TODO(task 6): replace with family_api.security.passwords.hash_password
def hash_password(plain: str) -> str:
    return plain


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
