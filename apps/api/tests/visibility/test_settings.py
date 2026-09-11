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
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


@pytest.mark.asyncio
async def test_defaults_are_summary_except_debts(client: AsyncClient) -> None:
    """FR-M3-03."""
    headers = await _member(client)
    response = await client.get("/api/v1/me/visibility", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["income"] == "summary"
    assert body["expenses"] == "summary"
    assert body["savings"] == "summary"
    assert body["debts"] == "private"


@pytest.mark.asyncio
async def test_member_can_change_their_own_settings(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.put(
        "/api/v1/me/visibility",
        json={
            "income": "public", "expenses": "private",
            "savings": "public", "debts": "summary",
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["income"] == "public"

    reread = await client.get("/api/v1/me/visibility", headers=headers)
    assert reread.json()["expenses"] == "private"


@pytest.mark.asyncio
async def test_the_response_carries_both_disclosures(client: AsyncClient) -> None:
    """FR-M3-08 / §6: copy lives with the rules so it cannot drift in the UI."""
    headers = await _member(client)
    body = (await client.get("/api/v1/me/visibility", headers=headers)).json()

    disclosures = " ".join(body["disclosures"])
    assert "totales del hogar incluyen a todos" in disclosures
    assert "aportes al hogar siempre son visibles" in disclosures.lower()


@pytest.mark.asyncio
async def test_there_is_no_route_to_set_another_members_visibility(
    client: AsyncClient,
) -> None:
    """FR-M3-06: no role can change someone else's settings."""
    from family_api.main import create_app

    # The OpenAPI schema, not app.routes, is the version-stable way to
    # enumerate the routing table: newer FastAPI wraps included routers
    # lazily, so `app.routes` no longer yields flat APIRoute instances.
    paths = {path for path in create_app().openapi()["paths"] if "visibility" in path}
    assert paths == {"/api/v1/me/visibility"}


@pytest.mark.asyncio
async def test_an_invalid_level_is_rejected(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.put(
        "/api/v1/me/visibility",
        json={
            "income": "sometimes", "expenses": "private",
            "savings": "public", "debts": "summary",
        },
        headers=headers,
    )

    assert response.status_code == 422
