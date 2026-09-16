"""Per-member "seen" state for a chore cycle draw.

The dashboard card that announces a new draw must disappear for the member
who saw it, without hiding it from anyone else — and reappear for everyone
the moment a new cycle is drawn.
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient


async def _admin_and_adult(client: AsyncClient) -> tuple[dict, dict]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    admin = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=admin)
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
    return admin, papa


async def _generate_cycle(client: AsyncClient, headers: dict) -> str:
    today = date.today()
    created = await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=1)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=headers,
    )
    return created.json()["id"]


@pytest.mark.asyncio
async def test_a_freshly_drawn_cycle_is_unseen(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    await _generate_cycle(client, admin)

    current = await client.get("/api/v1/chore-cycles/current", headers=admin)

    assert current.json()["seen"] is False


@pytest.mark.asyncio
async def test_marking_a_cycle_seen_hides_it_only_for_that_member(
    client: AsyncClient,
) -> None:
    admin, papa = await _admin_and_adult(client)
    cycle_id = await _generate_cycle(client, admin)

    marked = await client.post(f"/api/v1/chore-cycles/{cycle_id}/seen", headers=admin)
    assert marked.status_code == 204

    admin_view = await client.get("/api/v1/chore-cycles/current", headers=admin)
    papa_view = await client.get("/api/v1/chore-cycles/current", headers=papa)

    assert admin_view.json()["seen"] is True
    assert papa_view.json()["seen"] is False


@pytest.mark.asyncio
async def test_marking_seen_twice_does_not_error(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    cycle_id = await _generate_cycle(client, admin)

    first = await client.post(f"/api/v1/chore-cycles/{cycle_id}/seen", headers=admin)
    second = await client.post(f"/api/v1/chore-cycles/{cycle_id}/seen", headers=admin)

    assert first.status_code == 204
    assert second.status_code == 204


@pytest.mark.asyncio
async def test_a_new_cycle_is_unseen_even_if_the_previous_one_was_seen(
    client: AsyncClient,
) -> None:
    admin, _ = await _admin_and_adult(client)
    today = date.today()
    first_cycle = await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=20)).isoformat(),
            "ends_on": (today - timedelta(days=8)).isoformat(),
        },
        headers=admin,
    )
    await client.post(
        f"/api/v1/chore-cycles/{first_cycle.json()['id']}/seen", headers=admin
    )

    await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=1)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=admin,
    )

    current = await client.get("/api/v1/chore-cycles/current", headers=admin)
    assert current.json()["seen"] is False
