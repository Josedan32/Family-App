from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.session import get_session
from family_api.schemas.category import (
    CategoryResponse,
    CreateCategoryRequest,
    UpdateCategoryRequest,
)
from family_api.services import categories as category_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/categories", tags=["categories"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def list_categories(
    member: CurrentMember,
    session: SessionDep,
    kind: Literal["income", "expense"] | None = None,
    include_archived: bool = False,
) -> list[CategoryResponse]:
    rows = await category_service.list_categories(session, member, kind, include_archived)
    return [CategoryResponse.model_validate(r, from_attributes=True) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CreateCategoryRequest, member: CurrentMember, session: SessionDep
) -> CategoryResponse:
    category = await category_service.create_category(
        session, member, body.kind, body.name, body.icon
    )
    await session.commit()
    return CategoryResponse.model_validate(category, from_attributes=True)


@router.patch("/{category_id}")
async def update_category(
    category_id: UUID,
    body: UpdateCategoryRequest,
    member: CurrentMember,
    session: SessionDep,
) -> CategoryResponse:
    category = await category_service.update_category(
        session, member, category_id, body.name, body.icon
    )
    await session.commit()
    return CategoryResponse.model_validate(category, from_attributes=True)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_category(
    category_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await category_service.archive_category(session, member, category_id)
    await session.commit()
