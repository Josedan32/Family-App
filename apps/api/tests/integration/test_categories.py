import pytest
from httpx import AsyncClient


async def _member(client: AsyncClient) -> dict[str, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    token = registered.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


@pytest.mark.asyncio
async def test_seeded_expense_categories_are_listed(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.get("/api/v1/categories?kind=expense", headers=headers)

    assert response.status_code == 200
    names = {c["name"] for c in response.json()}
    assert {"Transporte", "Comida", "Salud", "Aporte al hogar"} <= names


@pytest.mark.asyncio
async def test_member_can_create_a_category(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Mascotas"
    assert response.json()["is_system"] is False


@pytest.mark.asyncio
async def test_duplicate_category_name_in_the_same_kind_is_rejected(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )
    response = await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_deleting_a_category_archives_it(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )
    category_id = created.json()["id"]

    deleted = await client.delete(f"/api/v1/categories/{category_id}", headers=headers)
    assert deleted.status_code == 204

    listed = await client.get("/api/v1/categories?kind=expense", headers=headers)
    assert "Mascotas" not in {c["name"] for c in listed.json()}

    with_archived = await client.get(
        "/api/v1/categories?kind=expense&include_archived=true", headers=headers
    )
    assert "Mascotas" in {c["name"] for c in with_archived.json()}


@pytest.mark.asyncio
async def test_system_categories_archive_but_are_never_deleted(
    client: AsyncClient,
) -> None:
    """FR-M2-02: archiving preserves them on historical records."""
    headers = await _member(client)
    listed = await client.get("/api/v1/categories?kind=expense", headers=headers)
    comida_id = next(c["id"] for c in listed.json() if c["name"] == "Comida")

    deleted = await client.delete(f"/api/v1/categories/{comida_id}", headers=headers)
    assert deleted.status_code == 204

    with_archived = await client.get(
        "/api/v1/categories?kind=expense&include_archived=true", headers=headers
    )
    comida = next(c for c in with_archived.json() if c["name"] == "Comida")
    assert comida["archived_at"] is not None
