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


async def _household_with_member(client: AsyncClient, role: str = "adult") -> tuple[str, str]:
    """Returns (admin_token, member_id) for a second, non-admin member."""
    admin = await _register(client, "daniel@example.com")
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernandez"}, headers=_auth(admin)
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": role},
        headers=_auth(admin),
    )
    second = await _register(client, "papa@example.com")
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=_auth(second)
    )
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    member_id = next(m["id"] for m in listed.json()["members"] if m["role"] != "admin")
    return admin, member_id


@pytest.mark.asyncio
async def test_admin_can_update_a_members_role_and_relationship(client: AsyncClient) -> None:
    admin, member_id = await _household_with_member(client)

    response = await client.patch(
        f"/api/v1/households/current/members/{member_id}",
        json={"role": "teen", "relationship": "Hijo"},
        headers=_auth(admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "teen"
    assert body["relationship"] == "Hijo"


@pytest.mark.asyncio
async def test_non_admin_cannot_update_a_member(client: AsyncClient) -> None:
    admin, member_id = await _household_with_member(client)
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    papa_token_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "papa@example.com", "password": "correct-horse-battery"},
    )
    papa = papa_token_response.json()["access_token"]
    admin_id = next(m["id"] for m in listed.json()["members"] if m["role"] == "admin")

    response = await client.patch(
        f"/api/v1/households/current/members/{admin_id}",
        json={"relationship": "Papá"},
        headers=_auth(papa),
    )

    assert response.status_code == 403
    assert response.json()["type"] == "forbidden_role"


@pytest.mark.asyncio
async def test_demoting_the_last_admin_is_rejected(client: AsyncClient) -> None:
    """INV-R-01: a household must always keep at least one admin."""
    admin = await _register(client, "daniel@example.com")
    listed = await client.post(
        "/api/v1/households", json={"name": "Hogar"}, headers=_auth(admin)
    )
    assert listed.status_code == 201
    self_id = (
        await client.get("/api/v1/households/current", headers=_auth(admin))
    ).json()["members"][0]["id"]

    response = await client.patch(
        f"/api/v1/households/current/members/{self_id}",
        json={"role": "adult"},
        headers=_auth(admin),
    )

    assert response.status_code == 409
    assert response.json()["type"] == "last_admin"
