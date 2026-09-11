"""Unit tests for the resolver's decision logic.

The full endpoint matrix lives in tests/visibility/test_matrix.py. These cover
the rules in isolation, with a fake session, so a logic error is reported here
rather than as forty confusing endpoint failures.
"""

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest

from family_api.services.visibility import Level, resolve


@dataclass
class FakeMember:
    id: UUID
    household_id: UUID
    role: str


class FakeSession:
    def __init__(self, level: str | None = None, raises: bool = False) -> None:
        self._level = level
        self._raises = raises

    async def scalar(self, *_args, **_kwargs) -> str | None:
        if self._raises:
            raise RuntimeError("database is unreachable")
        return self._level


HOUSEHOLD = uuid4()


def member(role: str = "adult", household_id: UUID = HOUSEHOLD) -> FakeMember:
    return FakeMember(id=uuid4(), household_id=household_id, role=role)


@pytest.mark.asyncio
async def test_a_member_always_sees_their_own_data_in_full() -> None:
    """VR-03: settings describe what OTHERS see, never what you see."""
    me = member()
    assert await resolve(FakeSession("private"), me, me, "debts") is Level.FULL


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "adult", "teen"])
async def test_no_role_grants_extra_visibility(role: str) -> None:
    """VR-01: an administrator resolves identically to a teen."""
    viewer, owner = member(role), member()
    assert await resolve(FakeSession("private"), viewer, owner, "debts") is Level.NONE
    assert await resolve(FakeSession("summary"), viewer, owner, "income") is Level.SUMMARY
    assert await resolve(FakeSession("public"), viewer, owner, "income") is Level.FULL


@pytest.mark.asyncio
async def test_a_guest_sees_nothing_even_when_the_owner_is_public() -> None:
    """VR-02: public means public TO THE HOUSEHOLD; a guest is a visitor."""
    assert await resolve(FakeSession("public"), member("guest"), member(), "income") is Level.NONE


@pytest.mark.asyncio
async def test_cross_household_is_denied_before_anything_else() -> None:
    """VR-04."""
    viewer = member(household_id=uuid4())
    assert await resolve(FakeSession("public"), viewer, member(), "income") is Level.NONE


@pytest.mark.asyncio
async def test_a_missing_setting_falls_back_to_the_module_default() -> None:
    """VR-05: never `public`. Debts default to private."""
    viewer, owner = member(), member()
    assert await resolve(FakeSession(None), viewer, owner, "debts") is Level.NONE
    assert await resolve(FakeSession(None), viewer, owner, "income") is Level.SUMMARY


@pytest.mark.asyncio
async def test_a_lookup_failure_fails_closed() -> None:
    """VR-05: if the resolver cannot decide, it denies."""
    viewer, owner = member(), member()
    assert await resolve(FakeSession(raises=True), viewer, owner, "income") is Level.NONE


@pytest.mark.asyncio
async def test_self_check_precedes_the_guest_denial() -> None:
    """A guest is not given a ledger, but the ordering must still be right."""
    me = member("guest")
    assert await resolve(FakeSession("private"), me, me, "income") is Level.FULL
