import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_member_can_edit_their_own_profile(client: AsyncClient) -> None:
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.patch(
        "/api/v1/me/profile",
        json={"display_name": "Daniel H.", "birth_date": "2003-05-14"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Daniel H."
    assert body["birth_date"] == "2003-05-14"


@pytest.mark.asyncio
async def test_age_is_derived_from_birth_date(client: AsyncClient) -> None:
    """FR-M1-06: the response carries an age, the database does not."""
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.patch(
        "/api/v1/me/profile", json={"birth_date": "2000-01-01"}, headers=headers
    )

    response = await client.get("/api/v1/auth/me", headers=headers)

    assert response.json()["age"] >= 25


@pytest.mark.asyncio
async def test_profile_edit_requires_authentication(client: AsyncClient) -> None:
    response = await client.patch("/api/v1/me/profile", json={"display_name": "X"})
    assert response.status_code == 401
