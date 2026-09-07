import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import Category, VisibilitySetting


async def _register(client: AsyncClient, email: str = "daniel@example.com") -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": "Daniel"},
    )
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_creating_a_household_makes_the_creator_admin(client: AsyncClient) -> None:
    token = await _register(client)
    response = await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=_auth(token)
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Familia Hernández"
    assert body["currency"] == "COP"
    assert body["timezone"] == "America/Bogota"
    assert body["my_role"] == "admin"


@pytest.mark.asyncio
async def test_creating_a_second_household_is_rejected(client: AsyncClient) -> None:
    """FR-M1-02."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Uno"}, headers=_auth(token))
    response = await client.post(
        "/api/v1/households", json={"name": "Dos"}, headers=_auth(token)
    )

    assert response.status_code == 409
    assert response.json()["type"] == "already_in_household"


@pytest.mark.asyncio
async def test_creation_seeds_the_spec_categories(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """FR-M2-01, including the Aporte al hogar system category."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=_auth(token))

    rows = (await db_session.scalars(select(Category))).all()
    income = {c.name for c in rows if c.kind == "income"}
    expense = {c.name for c in rows if c.kind == "expense"}

    assert income == {"Salario", "Negocio", "Regalos", "Otros"}
    assert expense == {
        "Transporte", "Comida", "Educación", "Entretenimiento",
        "Salud", "Otros", "Aporte al hogar",
    }
    aporte = next(c for c in rows if c.name == "Aporte al hogar")
    assert aporte.is_system is True


@pytest.mark.asyncio
async def test_creation_seeds_visibility_with_debts_private(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """FR-M3-03: debts start closed; everything else starts at summary."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=_auth(token))

    settings = {
        s.module: s.level for s in (await db_session.scalars(select(VisibilitySetting))).all()
    }

    assert settings == {
        "income": "summary",
        "expenses": "summary",
        "savings": "summary",
        "debts": "private",
    }


@pytest.mark.asyncio
async def test_creating_a_household_requires_authentication(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/households", json={"name": "X"})).status_code == 401


@pytest.mark.asyncio
async def test_current_household_returns_members_with_derived_age(
    client: AsyncClient,
) -> None:
    """FR-M1-06: age is derived, never stored."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=_auth(token))

    response = await client.get("/api/v1/households/current", headers=_auth(token))

    assert response.status_code == 200
    member = response.json()["members"][0]
    assert member["display_name"] == "Daniel"
    assert member["role"] == "admin"
    assert "age" in member
