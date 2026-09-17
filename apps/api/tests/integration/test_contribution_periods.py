import pytest
from httpx import AsyncClient


async def _admin_and_papa(client: AsyncClient) -> tuple[dict, dict, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    admin = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=admin
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=admin,
    )
    registered_papa = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "papa@example.com",
            "password": "correct-horse-battery",
            "display_name": "Papá",
        },
    )
    papa = {"Authorization": f"Bearer {registered_papa.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=papa
    )
    listed = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return admin, papa, papa_id


PERIOD = {"period_month": "2026-09-01", "goal_amount_minor": 2_000_000}


@pytest.mark.asyncio
async def test_admin_can_open_a_period(client: AsyncClient) -> None:
    admin, _, _ = await _admin_and_papa(client)
    response = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )

    assert response.status_code == 201
    body = response.json()
    assert body["goal_amount_minor"] == 2_000_000
    assert body["status"] == "open"


@pytest.mark.asyncio
async def test_non_admin_cannot_open_a_period(client: AsyncClient) -> None:
    """FR-M4-01: setting the household target is an admin capability."""
    _, papa, _ = await _admin_and_papa(client)
    response = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=papa
    )

    assert response.status_code == 403
    assert response.json()["type"] == "forbidden_role"


@pytest.mark.asyncio
async def test_a_second_period_in_the_same_month_is_rejected(
    client: AsyncClient,
) -> None:
    admin, _, _ = await _admin_and_papa(client)
    await client.post("/api/v1/contribution-periods", json=PERIOD, headers=admin)
    response = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )

    assert response.status_code == 409
    assert response.json()["type"] == "period_exists"


@pytest.mark.asyncio
async def test_admin_can_set_pledges(client: AsyncClient) -> None:
    """FR-M4-02."""
    admin, _, papa_id = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]

    response = await client.put(
        f"/api/v1/contribution-periods/{period_id}/pledges",
        json={"pledges": [{"member_id": papa_id, "expected_amount_minor": 1_000_000}]},
        headers=admin,
    )

    assert response.status_code == 200
    current = await client.get("/api/v1/contribution-periods/current", headers=admin)
    papa = next(m for m in current.json()["members"] if m["member_id"] == papa_id)
    assert papa["pledged_minor"] == 1_000_000


@pytest.mark.asyncio
async def test_setting_pledges_replaces_the_previous_set(client: AsyncClient) -> None:
    admin, _, papa_id = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]

    for amount in (1_000_000, 600_000):
        await client.put(
            f"/api/v1/contribution-periods/{period_id}/pledges",
            json={"pledges": [{"member_id": papa_id, "expected_amount_minor": amount}]},
            headers=admin,
        )

    current = await client.get("/api/v1/contribution-periods/current", headers=admin)
    papa = next(m for m in current.json()["members"] if m["member_id"] == papa_id)
    assert papa["pledged_minor"] == 600_000


@pytest.mark.asyncio
async def test_get_period_by_id_returns_detail(client: AsyncClient) -> None:
    admin, _, papa_id = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]
    await client.put(
        f"/api/v1/contribution-periods/{period_id}/pledges",
        json={"pledges": [{"member_id": papa_id, "expected_amount_minor": 1_000_000}]},
        headers=admin,
    )

    response = await client.get(
        f"/api/v1/contribution-periods/{period_id}", headers=admin
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == period_id
    assert body["status"] == "open"
    papa = next(m for m in body["members"] if m["member_id"] == papa_id)
    assert papa["pledged_minor"] == 1_000_000


@pytest.mark.asyncio
async def test_get_period_by_id_not_found(client: AsyncClient) -> None:
    admin, _, _ = await _admin_and_papa(client)
    missing_id = "00000000-0000-0000-0000-000000000000"

    response = await client.get(
        f"/api/v1/contribution-periods/{missing_id}", headers=admin
    )

    assert response.status_code == 404
    assert response.json()["type"] == "not_found"


@pytest.mark.asyncio
async def test_get_period_by_id_denies_cross_household_access(
    client: AsyncClient,
) -> None:
    admin, _, _ = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]

    outsider_registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "outsider@example.com",
            "password": "correct-horse-battery",
            "display_name": "Vecina",
        },
    )
    outsider = {
        "Authorization": f"Bearer {outsider_registered.json()['access_token']}"
    }
    await client.post(
        "/api/v1/households", json={"name": "Otra Familia"}, headers=outsider
    )

    response = await client.get(
        f"/api/v1/contribution-periods/{period_id}", headers=outsider
    )

    assert response.status_code == 404
    assert response.json()["type"] == "not_found"


@pytest.mark.asyncio
async def test_a_closed_period_rejects_target_changes(client: AsyncClient) -> None:
    """FR-M4-08."""
    admin, _, _ = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/close", headers=admin
    )

    response = await client.patch(
        f"/api/v1/contribution-periods/{period_id}",
        json={"goal_amount_minor": 3_000_000},
        headers=admin,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "period_closed"
