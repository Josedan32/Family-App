from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import TokenExpiredError
from family_api.security.tokens import decode_access_token


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: Annotated[AsyncSession, Depends(get_session)] = ...,  # type: ignore[assignment]
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise TokenExpiredError
    user = await session.get(User, decode_access_token(authorization.split(" ", 1)[1]))
    if user is None:
        raise TokenExpiredError
    return user


CurrentUser = Annotated[User, Depends(current_user)]
