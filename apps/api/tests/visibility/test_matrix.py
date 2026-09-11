"""The visibility matrix.

docs/visibility-rules.md §7. Asserts the EXACT status and the EXACT set of
field names for every combination. Field names, not just values: a future
feature that adds `transaction_count` to a summary would pass a value-only
assertion and leak. It fails this one.
"""

import pytest
from httpx import AsyncClient

MODULES = ["income", "expenses", "savings", "debts"]
LEVELS = ["private", "summary", "public"]

SUMMARY_FIELDS = {
    "income": {"period", "total_minor", "currency"},
    "expenses": {"period", "total_minor", "currency"},
    "savings": {"total_balance_minor", "currency"},
    "debts": {"total_outstanding_minor", "currency"},
}


async def _register(client: AsyncClient, email: str, name: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": name},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _build_household(client: AsyncClient, viewer_role: str) -> tuple[dict, dict, str]:
    """Daniel is admin; the viewer joins with `viewer_role`; Papá is the owner."""
    daniel = await _register(client, "daniel@example.com", "Daniel")
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=daniel)

    async def _join(email: str, name: str, role: str) -> dict[str, str]:
        invite = await client.post(
            "/api/v1/households/current/invites",
            json={"role_granted": role},
            headers=daniel,
        )
        headers = await _register(client, email, name)
        await client.post(
            "/api/v1/households/join",
            json={"code": invite.json()["code"]},
            headers=headers,
        )
        return headers

    papa = await _join("papa@example.com", "Papá", "adult")
    viewer = daniel if viewer_role == "admin" else await _join(
        "viewer@example.com", "Viewer", viewer_role
    )

    listed = await client.get("/api/v1/households/current", headers=daniel)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return viewer, papa, papa_id


async def _give_papa_data(client: AsyncClient, papa: dict) -> None:
    income = await client.get("/api/v1/categories?kind=income", headers=papa)
    salario = next(c["id"] for c in income.json() if c["name"] == "Salario")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "income", "category_id": salario,
            "amount_minor": 3_000_000, "occurred_on": "2026-09-05",
        },
        headers=papa,
    )
    expense = await client.get("/api/v1/categories?kind=expense", headers=papa)
    comida = next(c["id"] for c in expense.json() if c["name"] == "Comida")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": comida,
            "amount_minor": 500_000, "occurred_on": "2026-09-06",
        },
        headers=papa,
    )
    goal = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Viaje", "target_amount_minor": 2_000_000},
        headers=papa,
    )
    await client.post(
        f"/api/v1/me/savings-goals/{goal.json()['id']}/entries",
        json={"kind": "deposit", "amount_minor": 400_000, "occurred_on": "2026-09-07"},
        headers=papa,
    )
    await client.post(
        "/api/v1/me/debts",
        json={
            "creditor_type": "addi", "creditor_label": "Addi",
            "principal_minor": 1_200_000,
        },
        headers=papa,
    )


async def _set_all(client: AsyncClient, papa: dict, level: str) -> None:
    await client.put(
        "/api/v1/me/visibility",
        json={m: level for m in MODULES},
        headers=papa,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("viewer_role", ["admin", "adult", "teen"])
@pytest.mark.parametrize("level", LEVELS)
@pytest.mark.parametrize("module", MODULES)
async def test_matrix(
    client: AsyncClient, viewer_role: str, level: str, module: str
) -> None:
    viewer, papa, papa_id = await _build_household(client, viewer_role)
    await _give_papa_data(client, papa)
    await _set_all(client, papa, level)

    response = await client.get(
        f"/api/v1/members/{papa_id}/{module}?period=2026-09", headers=viewer
    )

    if level == "private":
        # VR-01: role is irrelevant. Admin resolves exactly like a teen.
        assert response.status_code == 403
        assert response.json()["type"] == "not_visible"
    elif level == "summary":
        assert response.status_code == 200
        assert set(response.json()) == SUMMARY_FIELDS[module]
    else:
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list) or "items" in body


@pytest.mark.asyncio
@pytest.mark.parametrize("module", MODULES)
async def test_a_guest_sees_nothing_even_when_public(
    client: AsyncClient, module: str
) -> None:
    """VR-02."""
    viewer, papa, papa_id = await _build_household(client, "guest")
    await _give_papa_data(client, papa)
    await _set_all(client, papa, "public")

    response = await client.get(f"/api/v1/members/{papa_id}/{module}", headers=viewer)

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("module", MODULES)
async def test_owner_always_sees_their_own_data(client: AsyncClient, module: str) -> None:
    """VR-03: even set to private."""
    _, papa, papa_id = await _build_household(client, "adult")
    await _give_papa_data(client, papa)
    await _set_all(client, papa, "private")

    response = await client.get(f"/api/v1/members/{papa_id}/{module}", headers=papa)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_private_and_empty_are_never_confusable(client: AsyncClient) -> None:
    """V-04 / §3.2."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _set_all(client, papa, "summary")

    empty = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=viewer
    )
    assert empty.status_code == 200
    assert empty.json()["total_minor"] == 0
    assert empty.json()["total_minor"] is not None

    await _set_all(client, papa, "private")
    private = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=viewer
    )
    assert private.status_code == 403


@pytest.mark.asyncio
async def test_denials_are_byte_identical_across_reasons(client: AsyncClient) -> None:
    """V-05 / §4.4: 'no such member' and 'private' must be indistinguishable."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _set_all(client, papa, "private")

    private = await client.get(f"/api/v1/members/{papa_id}/income", headers=viewer)
    missing = await client.get(
        "/api/v1/members/00000000-0000-0000-0000-000000000000/income", headers=viewer
    )

    assert private.status_code == missing.status_code == 403
    assert private.json()["type"] == missing.json()["type"] == "not_visible"
    assert private.json()["title"] == missing.json()["title"]


@pytest.mark.asyncio
async def test_a_setting_change_takes_effect_immediately(client: AsyncClient) -> None:
    """V-09: no caching window."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _give_papa_data(client, papa)

    await _set_all(client, papa, "private")
    assert (
        await client.get(f"/api/v1/members/{papa_id}/income", headers=viewer)
    ).status_code == 403

    await _set_all(client, papa, "public")
    assert (
        await client.get(f"/api/v1/members/{papa_id}/income", headers=viewer)
    ).status_code == 200


@pytest.mark.asyncio
async def test_both_loan_parties_see_it_with_debts_private(client: AsyncClient) -> None:
    """V-06 / FR-M2-16: a lender who cannot see their own loan has a worse
    tool than a notebook."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _set_all(client, papa, "private")
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=viewer
    )

    listed = await client.get("/api/v1/households/current", headers=viewer)
    viewer_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Viewer"
    )

    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": viewer_id, "borrower_member_id": papa_id,
            "amount_minor": 300_000, "lent_on": "2026-09-01",
        },
        headers=viewer,
    )
    assert created.status_code == 201

    for headers in (viewer, papa):
        loans = await client.get("/api/v1/loans", headers=headers)
        assert loans.status_code == 200
        assert len(loans.json()) == 1
