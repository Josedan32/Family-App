from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import Category
from family_api.db.session import get_session
from family_api.schemas.category import (
    CategoryResponse,
    CreateCategoryRequest,
    UpdateCategoryRequest,
)
from family_api.services import categories as category_service
from family_api.services.households import CONTRIBUTION_CATEGORY, RESERVED_CATEGORIES
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/categories", tags=["categories"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _to_response(category: Category) -> CategoryResponse:
    return CategoryResponse(
        id=category.id, kind=category.kind, name=category.name, icon=category.icon,
        is_system=category.is_system,
        is_contribution_category=(
            category.kind == "expense" and category.name == CONTRIBUTION_CATEGORY
        ),
        is_reserved=(category.kind, category.name) in RESERVED_CATEGORIES,
        archived_at=category.archived_at,
    )


@router.get("")
async def list_categories(
    member: CurrentMember,
    session: SessionDep,
    kind: Literal["income", "expense"] | None = None,
    include_archived: bool = False,
) -> list[CategoryResponse]:
    rows = await category_service.list_categories(session, member, kind, include_archived)
    return [_to_response(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CreateCategoryRequest, member: CurrentMember, session: SessionDep
) -> CategoryResponse:
    category = await category_service.create_category(
        session, member, body.kind, body.name, body.icon
    )
    await session.commit()
    return _to_response(category)


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
    return _to_response(category)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_category(
    category_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await category_service.archive_category(session, member, category_id)
    await session.commit()
