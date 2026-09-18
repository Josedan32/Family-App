"""A reached goal can be marked as used: the money went to what it was for.

From then on it is no longer savings. It stays listed, so the history of what
was saved and spent is still there, but it leaves the savings total and takes
no new entries.
"""

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.services import savings as savings_service


async def _member(client: AsyncClient) -> tuple[dict[str, str], str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": "daniel@example.com", "password": "correct-horse-battery",
              "display_name": "Daniel"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    household = await client.get("/api/v1/households/current", headers=headers)
    return headers, household.json()["my_member_id"]


async def _goal(client: AsyncClient, headers: dict[str, str], saved: int) -> str:
    goal = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Pasaporte", "target_amount_minor": 300_000},
        headers=headers,
    )
    goal_id = str(goal.json()["id"])
    if saved:
        await client.post(
            f"/api/v1/me/savings-goals/{goal_id}/entries",
            json={"kind": "deposit", "amount_minor": saved, "occurred_on": "2026-08-10"},
            headers=headers,
        )
    return goal_id


@pytest.mark.asyncio
async def test_a_reached_goal_can_be_marked_used(client: AsyncClient) -> None:
    headers, _ = await _member(client)
    goal_id = await _goal(client, headers, saved=300_000)

    response = await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/use",
        json={"used_on": "2026-08-20"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "usada"
    assert body["used_on"] == "2026-08-20"
    assert body["is_overdue"] is False


@pytest.mark.asyncio
async def test_a_goal_not_yet_reached_cannot_be_marked_used(client: AsyncClient) -> None:
    headers, _ = await _member(client)
    goal_id = await _goal(client, headers, saved=100_000)

    response = await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/use", json={}, headers=headers
    )

    assert response.status_code == 409
    assert response.json()["type"] == "goal_not_reached"


@pytest.mark.asyncio
async def test_a_used_goal_no_longer_counts_as_savings(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers, member_id = await _member(client)
    used = await _goal(client, headers, saved=300_000)
    kept = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 15_000_000},
        headers=headers,
    )
    await client.post(
        f"/api/v1/me/savings-goals/{kept.json()['id']}/entries",
        json={"kind": "deposit", "amount_minor": 50_000, "occurred_on": "2026-08-10"},
        headers=headers,
    )

    await client.post(f"/api/v1/me/savings-goals/{used}/use", json={}, headers=headers)

    assert await savings_service.total_balance(db_session, UUID(member_id)) == 50_000


@pytest.mark.asyncio
async def test_a_used_goal_stays_listed(client: AsyncClient) -> None:
    headers, _ = await _member(client)
    goal_id = await _goal(client, headers, saved=300_000)
    await client.post(f"/api/v1/me/savings-goals/{goal_id}/use", json={}, headers=headers)

    listed = await client.get("/api/v1/me/savings-goals", headers=headers)

    assert [g["state"] for g in listed.json()] == ["usada"]


@pytest.mark.asyncio
async def test_a_used_goal_takes_no_new_entries(client: AsyncClient) -> None:
    headers, _ = await _member(client)
    goal_id = await _goal(client, headers, saved=300_000)
    await client.post(f"/api/v1/me/savings-goals/{goal_id}/use", json={}, headers=headers)

    response = await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/entries",
        json={"kind": "deposit", "amount_minor": 1_000, "occurred_on": "2026-09-01"},
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "goal_used"


@pytest.mark.asyncio
async def test_marking_used_can_be_undone(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers, member_id = await _member(client)
    goal_id = await _goal(client, headers, saved=300_000)
    await client.post(f"/api/v1/me/savings-goals/{goal_id}/use", json={}, headers=headers)

    response = await client.delete(f"/api/v1/me/savings-goals/{goal_id}/use", headers=headers)

    assert response.status_code == 200
    assert response.json()["state"] == "completado"
    assert response.json()["used_on"] is None
    assert await savings_service.total_balance(db_session, UUID(member_id)) == 300_000


@pytest.mark.asyncio
async def test_only_the_owner_can_mark_a_goal_used(client: AsyncClient) -> None:
    headers, _ = await _member(client)
    goal_id = await _goal(client, headers, saved=300_000)
    other = await client.post(
        "/api/v1/auth/register",
        json={"email": "otro@example.com", "password": "correct-horse-battery",
              "display_name": "Otro"},
    )
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Otro"}, headers=other_headers)

    response = await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/use", json={}, headers=other_headers
    )

    assert response.status_code == 404
