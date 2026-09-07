import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, email: str, name: str) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": name},
    )
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _household_with_two_members(client: AsyncClient) -> tuple[str, str, str]:
    """Returns (admin_token, papa_token, papa_member_id)."""
    admin = await _register(client, "daniel@example.com", "Daniel")
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=_auth(admin)
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=_auth(admin),
    )
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post(
        "/api/v1/households/join",
        json={"code": invite.json()["code"]},
        headers=_auth(papa),
    )
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    papa_id = next(m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá")
    return admin, papa, papa_id


@pytest.mark.asyncio
async def test_admin_can_set_a_relationship_label(client: AsyncClient) -> None:
    admin, _, papa_id = await _household_with_two_members(client)

    response = await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"relationship": "Padre"},
        headers=_auth(admin),
    )

    assert response.status_code == 200
    assert response.json()["relationship"] == "Padre"


@pytest.mark.asyncio
async def test_admin_can_change_a_role(client: AsyncClient) -> None:
    admin, _, papa_id = await _household_with_two_members(client)

    response = await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"role": "teen"},
        headers=_auth(admin),
    )

    assert response.status_code == 200
    assert response.json()["role"] == "teen"


@pytest.mark.asyncio
async def test_non_admin_cannot_change_roles(client: AsyncClient) -> None:
    admin, papa, papa_id = await _household_with_two_members(client)

    response = await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"role": "admin"},
        headers=_auth(papa),
    )

    assert response.status_code == 403
    assert response.json()["type"] == "forbidden_role"


@pytest.mark.asyncio
async def test_the_last_admin_cannot_be_demoted(client: AsyncClient) -> None:
    """INV-R-01 / H-01."""
    admin, _, _ = await _household_with_two_members(client)
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    admin_id = next(m["id"] for m in listed.json()["members"] if m["role"] == "admin")

    response = await client.patch(
        f"/api/v1/households/current/members/{admin_id}",
        json={"role": "adult"},
        headers=_auth(admin),
    )

    assert response.status_code == 409
    assert response.json()["type"] == "last_admin"


@pytest.mark.asyncio
async def test_the_last_admin_cannot_be_deactivated(client: AsyncClient) -> None:
    admin, _, _ = await _household_with_two_members(client)
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    admin_id = next(m["id"] for m in listed.json()["members"] if m["role"] == "admin")

    response = await client.delete(
        f"/api/v1/households/current/members/{admin_id}", headers=_auth(admin)
    )

    assert response.status_code == 409
    assert response.json()["type"] == "last_admin"


@pytest.mark.asyncio
async def test_a_second_admin_makes_demotion_possible(client: AsyncClient) -> None:
    admin, _, papa_id = await _household_with_two_members(client)
    await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"role": "admin"},
        headers=_auth(admin),
    )
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    admin_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Daniel"
    )

    response = await client.patch(
        f"/api/v1/households/current/members/{admin_id}",
        json={"role": "adult"},
        headers=_auth(admin),
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_deactivation_keeps_the_member_listed(client: AsyncClient) -> None:
    """INV-R-03: deactivation removes access, it does not erase history."""
    admin, _, papa_id = await _household_with_two_members(client)
    await client.delete(
        f"/api/v1/households/current/members/{papa_id}", headers=_auth(admin)
    )

    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    papa = next(m for m in listed.json()["members"] if m["id"] == papa_id)

    assert papa["status"] == "inactive"
