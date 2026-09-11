from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.session import get_session
from family_api.services.dashboard import build_dashboard
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def dashboard(
    member: CurrentMember, session: SessionDep, period: str | None = None
) -> JSONResponse:
    """Returned via JSONResponse with exclude_none so a private module cell
    emits {"level": "private"} and no figure key at all."""
    payload = await build_dashboard(session, member, period)
    return JSONResponse(content=payload.model_dump(mode="json", exclude_none=True))
