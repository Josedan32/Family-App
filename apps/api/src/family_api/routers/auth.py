from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.session import get_session
from family_api.ratelimit import check_rate_limit
from family_api.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UpdateProfileRequest,
    UserResponse,
)
from family_api.security.deps import CurrentUser
from family_api.services import auth as auth_service
from family_api.services.members import derive_age

router = APIRouter(prefix="/auth", tags=["auth"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _limit_auth(request: Request) -> None:
    settings = get_settings()
    client = request.client.host if request.client else "unknown"
    check_rate_limit(f"auth:{client}", settings.rate_limit_auth_per_minute, 60)


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, session: SessionDep, request: Request) -> TokenPair:
    _limit_auth(request)
    _, pair = await auth_service.register_user(
        session, body.email, body.password, body.display_name
    )
    await session.commit()
    return pair


@router.post("/login")
async def login(body: LoginRequest, session: SessionDep, request: Request) -> TokenPair:
    _limit_auth(request)
    pair = await auth_service.login(session, body.email, body.password)
    await session.commit()
    return pair


@router.post("/refresh")
async def refresh(body: RefreshRequest, session: SessionDep) -> TokenPair:
    pair = await auth_service.rotate_refresh(session, body.refresh_token)
    await session.commit()
    return pair


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, session: SessionDep) -> None:
    await auth_service.revoke_refresh(session, body.refresh_token)
    await session.commit()


@router.get("/me")
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        photo_url=user.photo_url,
        birth_date=user.birth_date,
        age=derive_age(user.birth_date),
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest, user: CurrentUser, session: SessionDep, request: Request
) -> None:
    _limit_auth(request)
    await auth_service.change_password(
        session, user, body.current_password, body.new_password
    )
    await session.commit()


me_router = APIRouter(prefix="/me", tags=["profile"])


@me_router.patch("/profile")
async def update_profile(
    body: UpdateProfileRequest, user: CurrentUser, session: SessionDep
) -> UserResponse:
    await auth_service.update_profile(
        user,
        display_name=body.display_name,
        photo_url=body.photo_url,
        birth_date=body.birth_date,
    )
    await session.commit()
    return UserResponse(
        id=user.id, email=user.email, display_name=user.display_name,
        photo_url=user.photo_url, birth_date=user.birth_date,
        age=derive_age(user.birth_date),
    )
