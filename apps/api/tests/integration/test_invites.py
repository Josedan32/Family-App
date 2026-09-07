import pytest
from httpx import AsyncClient


async def _admin_with_household(client: AsyncClient) -> str:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    token = registered.json()["access_token"]
    await client.post(
        "/api/v1/households",
        json={"name": "Familia Hernández"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_can_issue_an_invite(client: AsyncClient) -> None:
    token = await _admin_with_household(client)
    response = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=_auth(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert len(body["code"]) == 8
    assert body["role_granted"] == "adult"
    assert body["max_uses"] == 1
    assert body["expires_at"]


@pytest.mark.asyncio
async def test_admin_can_list_invites(client: AsyncClient) -> None:
    token = await _admin_with_household(client)
    await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "teen"},
        headers=_auth(token),
    )

    response = await client.get("/api/v1/households/current/invites", headers=_auth(token))

    assert response.status_code == 200
    assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_revoking_an_invite_is_irreversible(client: AsyncClient) -> None:
    token = await _admin_with_household(client)
    created = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=_auth(token),
    )
    invite_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/v1/households/current/invites/{invite_id}", headers=_auth(token)
    )
    assert deleted.status_code == 204

    listed = await client.get("/api/v1/households/current/invites", headers=_auth(token))
    assert listed.json()[0]["revoked_at"] is not None
