import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from family_api.config import get_settings
from family_api.db.models.household import InviteCode
from family_api.db.models.user import User
from family_api.db.session import engine_for, session_factory_for
from family_api.errors import InviteExhaustedError
from family_api.services.invites import redeem_invite


@pytest.mark.asyncio
async def test_concurrent_redemption_never_exceeds_max_uses(seeded_invite) -> None:
    """H-02 / INV-D-05: one succeeds, one is rejected. `uses` never exceeds 1."""
    code, joiner_ids = seeded_invite
    engine = engine_for(get_settings().test_database_url)
    factory = session_factory_for(engine)

    async def attempt(user_id) -> str:
        async with factory() as session:
            user = await session.get(User, user_id)
            assert user is not None
            try:
                await redeem_invite(session, user, code)
                await session.commit()
                return "ok"
            except (InviteExhaustedError, IntegrityError):
                await session.rollback()
                return "rejected"

    results = await asyncio.gather(*(attempt(uid) for uid in joiner_ids))

    assert sorted(results) == ["ok", "rejected"]

    async with factory() as session:
        invite = await session.scalar(select(InviteCode).where(InviteCode.code == code))
        assert invite is not None
        assert invite.uses == 1
    await engine.dispose()
