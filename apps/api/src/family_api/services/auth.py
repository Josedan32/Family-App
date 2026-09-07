from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.user import RefreshToken, User
from family_api.errors import (
    AlreadyInHouseholdError,
    InvalidCredentialsError,
    TokenExpiredError,
    TokenReusedError,
)
from family_api.ids import new_id
from family_api.schemas.auth import TokenPair
from family_api.security.passwords import hash_password, verify_password
from family_api.security.tokens import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)


async def _issue_pair(session: AsyncSession, user: User) -> TokenPair:
    raw, hashed = generate_refresh_token()
    session.add(
        RefreshToken(
            id=new_id(),
            user_id=user.id,
            token_hash=hashed,
            expires_at=datetime.now(UTC)
            + timedelta(days=get_settings().refresh_token_ttl_days),
        )
    )
    await session.flush()
    return TokenPair(access_token=create_access_token(user.id), refresh_token=raw)


async def register_user(
    session: AsyncSession, email: str, password: str, display_name: str
) -> tuple[User, TokenPair]:
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        # Reuses the 409 slug family; the API contract lists this as a conflict.
        raise AlreadyInHouseholdError
    user = User(
        id=new_id(),
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
    )
    session.add(user)
    await session.flush()
    return user, await _issue_pair(session, user)


async def login(session: AsyncSession, email: str, password: str) -> TokenPair:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.password_hash):
        # Identical for unknown email and wrong password (H-08).
        raise InvalidCredentialsError
    return await _issue_pair(session, user)


async def rotate_refresh(session: AsyncSession, raw_token: str) -> TokenPair:
    hashed = hash_refresh_token(raw_token)
    stored = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hashed).with_for_update()
    )
    if stored is None:
        raise TokenExpiredError
    if stored.revoked_at is not None:
        # Replay of a rotated token means it leaked. Revoke the whole family.
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        raise TokenReusedError
    if stored.expires_at <= datetime.now(UTC):
        raise TokenExpiredError

    stored.revoked_at = datetime.now(UTC)
    user = await session.get(User, stored.user_id)
    assert user is not None
    return await _issue_pair(session, user)


async def revoke_refresh(session: AsyncSession, raw_token: str) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .values(revoked_at=datetime.now(UTC))
    )
