import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.user import User


@pytest.mark.asyncio
async def test_user_can_be_persisted(db_session: AsyncSession, make_user) -> None:
    user = await make_user(email="daniel@example.com")
    found = await db_session.scalar(select(User).where(User.id == user.id))

    assert found is not None
    assert found.display_name == "Daniel"
    assert found.created_at is not None


@pytest.mark.asyncio
async def test_email_is_case_insensitive_unique(db_session: AsyncSession, make_user) -> None:
    """CITEXT: Daniel@example.com and daniel@example.com are the same account."""
    await make_user(email="daniel@example.com")
    with pytest.raises(IntegrityError):
        await make_user(email="Daniel@example.com")


@pytest.mark.asyncio
async def test_birth_date_is_nullable_and_age_is_not_stored(make_user) -> None:
    """FR-M1-06: age is derived at read time, never stored."""
    user = await make_user()
    assert user.birth_date is None
    assert not hasattr(user, "age")
