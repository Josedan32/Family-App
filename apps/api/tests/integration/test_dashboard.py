import pytest
from httpx import AsyncClient


async def _household(client: AsyncClient) -> tuple[dict, dict, str]:
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


async def _earn(client: AsyncClient, headers: dict, amount: int) -> None:
    categories = await client.get("/api/v1/categories?kind=income", headers=headers)
    salario = next(c["id"] for c in categories.json() if c["name"] == "Salario")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "income", "category_ids": [salario],
            "amount_minor": amount, "occurred_on": "2026-09-05",
        },
        headers=headers,
    )


async def _spend(
    client: AsyncClient, headers: dict, amount: int, category_name: str = "Comida"
) -> None:
    categories = await client.get("/api/v1/categories?kind=expense", headers=headers)
    category_id = next(c["id"] for c in categories.json() if c["name"] == category_name)
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [category_id],
            "amount_minor": amount, "occurred_on": "2026-09-05",
        },
        headers=headers,
    )


async def _spend_household(
    client: AsyncClient, headers: dict, amount: int, category_name: str = "Servicios"
) -> None:
    categories = await client.get("/api/v1/categories?kind=expense", headers=headers)
    category_id = next(c["id"] for c in categories.json() if c["name"] == category_name)
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": amount,
            "occurred_on": "2026-09-05", "funding": "member",
        },
        headers=headers,
    )


@pytest.mark.asyncio
async def test_household_totals_include_private_members(client: AsyncClient) -> None:
    """FR-D1-02 / spec §8.4.

    The derivability leak is disclosed, not fixed by suppression. Excluding
    private members would make the dashboard wrong AND create a new leak.
    """
    admin, papa, _ = await _household(client)
    await _earn(client, admin, 2_500_000)
    await _earn(client, papa, 3_000_000)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)

    assert response.status_code == 200
    assert response.json()["household"]["income_minor"] == 5_500_000


@pytest.mark.asyncio
async def test_a_private_module_carries_level_and_no_figure(
    client: AsyncClient,
) -> None:
    """A private module must not be `null` or `0` — both are disclosures."""
    admin, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["income"] == {"level": "private"}
    assert "total_minor" not in card["income"]


@pytest.mark.asyncio
async def test_a_summary_module_carries_the_total(client: AsyncClient) -> None:
    admin, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["income"]["level"] == "summary"
    assert card["income"]["total_minor"] == 3_000_000


@pytest.mark.asyncio
async def test_a_fully_private_member_shows_identity_only(
    client: AsyncClient,
) -> None:
    """FR-D1-03."""
    admin, papa, papa_id = await _household(client)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["display_name"] == "Papá"
    assert all(
        card[module] == {"level": "private"}
        for module in ("income", "expenses", "savings", "debts")
    )


@pytest.mark.asyncio
async def test_a_member_sees_their_own_card_in_full(client: AsyncClient) -> None:
    """VR-03 applies on the dashboard too."""
    _, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=papa)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["income"]["level"] == "full"
    assert card["income"]["total_minor"] == 3_000_000


@pytest.mark.asyncio
async def test_a_guest_sees_aggregates_but_no_member_figures(
    client: AsyncClient,
) -> None:
    """VR-02."""
    admin, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "guest"},
        headers=admin,
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "tia@example.com",
            "password": "correct-horse-battery",
            "display_name": "Tía",
        },
    )
    guest = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=guest
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=guest)

    assert response.status_code == 200
    assert response.json()["household"]["income_minor"] == 3_000_000
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)
    assert card["income"] == {"level": "private"}


@pytest.mark.asyncio
async def test_a_private_members_category_breakdown_is_omitted(
    client: AsyncClient,
) -> None:
    """Matches the existing visibility test pattern for other dashboard cells."""
    admin, papa, papa_id = await _household(client)
    await _spend(client, papa, 100_000, "Comida")
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["expenses_by_category"] == {"level": "private"}
    assert "rows" not in card["expenses_by_category"]


@pytest.mark.asyncio
async def test_a_visible_members_category_breakdown_sums_correctly(
    client: AsyncClient,
) -> None:
    admin, papa, papa_id = await _household(client)
    await _spend(client, papa, 100_000, "Comida")
    await _spend(client, papa, 40_000, "Comida")
    await _spend(client, papa, 25_000, "Transporte")

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["expenses_by_category"]["level"] == "summary"
    rows = {r["category_name"]: r["amount_minor"] for r in card["expenses_by_category"]["rows"]}
    assert rows == {"Comida": 140_000, "Transporte": 25_000}


@pytest.mark.asyncio
async def test_a_multi_category_expense_counts_fully_in_each_category(
    client: AsyncClient,
) -> None:
    """A transaction tagged with two categories (Task 9's pattern) is a
    breakdown of "how much went toward X", not a partition of the total:
    each category gets the full amount, so rows can outsum the plain total."""
    admin, papa, papa_id = await _household(client)
    categories = await client.get("/api/v1/categories?kind=expense", headers=papa)
    comida = next(c["id"] for c in categories.json() if c["name"] == "Comida")
    transporte = next(c["id"] for c in categories.json() if c["name"] == "Transporte")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida, transporte],
            "amount_minor": 60_000, "occurred_on": "2026-09-05",
        },
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)
    rows = {r["category_name"]: r["amount_minor"] for r in card["expenses_by_category"]["rows"]}

    assert rows == {"Comida": 60_000, "Transporte": 60_000}
    assert card["expenses"]["total_minor"] == 60_000


@pytest.mark.asyncio
async def test_household_category_breakdown_aggregates_household_expenses(
    client: AsyncClient,
) -> None:
    admin, _, _ = await _household(client)
    await _spend_household(client, admin, 300_000, "Servicios")
    await _spend_household(client, admin, 50_000, "Servicios")
    await _spend_household(client, admin, 90_000, "Internet")

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    rows = {
        r["category_name"]: r["amount_minor"]
        for r in response.json()["household"]["household_ledger_expenses_by_category"]
    }

    assert rows == {"Servicios": 350_000, "Internet": 90_000}


@pytest.mark.asyncio
async def test_the_dashboard_reports_the_pot(client: AsyncClient) -> None:
    admin, _, _ = await _household(client)
    await client.post(
        "/api/v1/contribution-periods",
        json={"period_month": "2026-09-01", "goal_amount_minor": 2_000_000},
        headers=admin,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)

    assert response.status_code == 200
    assert "pot" in response.json()
    assert response.json()["pot"]["balance_minor"] == 0
