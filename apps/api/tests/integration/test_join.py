import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import VisibilitySetting


async def _register(client: AsyncClient, email: str, name: str) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": name},
    )
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _household_with_invite(client: AsyncClient, role: str = "adult") -> tuple[str, str]:
    admin = await _register(client, "daniel@example.com", "Daniel")
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=_auth(admin)
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": role},
        headers=_auth(admin),
    )
    return admin, invite.json()["code"]


@pytest.mark.asyncio
async def test_joining_with_a_valid_code_grants_the_coded_role(client: AsyncClient) -> None:
    _, code = await _household_with_invite(client, role="adult")
    papa = await _register(client, "papa@example.com", "Papá")

    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(papa)
    )

    assert response.status_code == 201
    assert response.json()["my_role"] == "adult"


@pytest.mark.asyncio
async def test_joining_seeds_visibility_defaults(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """FR-M3-03 applies on join, not only on creation."""
    _, code = await _household_with_invite(client)
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post("/api/v1/households/join", json={"code": code}, headers=_auth(papa))

    rows = (await db_session.scalars(select(VisibilitySetting))).all()
    per_member: dict[str, dict[str, str]] = {}
    for row in rows:
        per_member.setdefault(str(row.member_id), {})[row.module] = row.level

    assert len(per_member) == 2
    for settings in per_member.values():
        assert settings["debts"] == "private"
        assert settings["income"] == "summary"


@pytest.mark.asyncio
async def test_unknown_code_is_rejected(client: AsyncClient) -> None:
    papa = await _register(client, "papa@example.com", "Papá")
    response = await client.post(
        "/api/v1/households/join", json={"code": "ZZZZZZZZ"}, headers=_auth(papa)
    )

    assert response.status_code == 400
    assert response.json()["type"] == "invite_not_found"


@pytest.mark.asyncio
async def test_revoked_code_is_rejected(client: AsyncClient) -> None:
    admin, code = await _household_with_invite(client)
    listed = await client.get("/api/v1/households/current/invites", headers=_auth(admin))
    await client.delete(
        f"/api/v1/households/current/invites/{listed.json()[0]['id']}", headers=_auth(admin)
    )

    papa = await _register(client, "papa@example.com", "Papá")
    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(papa)
    )

    assert response.status_code == 400
    assert response.json()["type"] == "invite_revoked"


@pytest.mark.asyncio
async def test_exhausted_code_is_rejected(client: AsyncClient) -> None:
    """max_uses defaults to 1, so the second redemption must fail."""
    _, code = await _household_with_invite(client)
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post("/api/v1/households/join", json={"code": code}, headers=_auth(papa))

    mama = await _register(client, "mama@example.com", "Mamá")
    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(mama)
    )

    assert response.status_code == 400
    assert response.json()["type"] == "invite_exhausted"


@pytest.mark.asyncio
async def test_a_member_cannot_join_a_second_household(client: AsyncClient) -> None:
    _, code = await _household_with_invite(client)
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post("/api/v1/households/join", json={"code": code}, headers=_auth(papa))

    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(papa)
    )
    assert response.status_code == 409
    assert response.json()["type"] == "already_in_household"
