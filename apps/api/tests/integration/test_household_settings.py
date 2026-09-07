import pytest
from httpx import AsyncClient


async def _admin(client: AsyncClient) -> str:
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


@pytest.mark.asyncio
async def test_admin_can_rename_the_household(client: AsyncClient) -> None:
    token = await _admin(client)
    response = await client.patch(
        "/api/v1/households/current",
        json={"name": "Casa Hernández"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Casa Hernández"


@pytest.mark.asyncio
async def test_currency_cannot_be_changed(client: AsyncClient) -> None:
    """Changing currency would reinterpret every stored amount."""
    token = await _admin(client)
    response = await client.patch(
        "/api/v1/households/current",
        json={"currency": "USD"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code in (200, 422)
    current = await client.get(
        "/api/v1/households/current", headers={"Authorization": f"Bearer {token}"}
    )
    assert current.json()["currency"] == "COP"
