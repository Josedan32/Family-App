import pytest
from httpx import AsyncClient

REGISTRATION = {
    "email": "daniel@example.com",
    "password": "correct-horse-battery",
    "display_name": "Daniel",
}


@pytest.mark.asyncio
async def test_register_returns_a_token_pair(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/register", json=REGISTRATION)

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_rejects_a_duplicate_email(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    response = await client.post("/api/v1/auth/register", json=REGISTRATION)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login_succeeds_with_correct_credentials(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": REGISTRATION["email"], "password": REGISTRATION["password"]},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


@pytest.mark.asyncio
async def test_wrong_password_and_unknown_email_are_indistinguishable(
    client: AsyncClient,
) -> None:
    """H-08: the response must not reveal whether the account exists."""
    await client.post("/api/v1/auth/register", json=REGISTRATION)

    wrong_password = await client.post(
        "/api/v1/auth/login",
        json={"email": REGISTRATION["email"], "password": "nope"},
    )
    unknown_email = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "nope"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


@pytest.mark.asyncio
async def test_refresh_rotates_the_token(client: AsyncClient) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    original = registered.json()["refresh_token"]

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})

    assert response.status_code == 200
    assert response.json()["refresh_token"] != original


@pytest.mark.asyncio
async def test_replaying_a_rotated_refresh_token_is_rejected(client: AsyncClient) -> None:
    """H-07: replay means the token leaked. Revoke the whole family."""
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    original = registered.json()["refresh_token"]
    rotated = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    new_token = rotated.json()["refresh_token"]

    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    assert replay.status_code == 401
    assert replay.json()["type"] == "token_reused"

    after_revocation = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": new_token}
    )
    assert after_revocation.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_me_returns_the_authenticated_user(client: AsyncClient) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    token = registered.json()["access_token"]

    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == REGISTRATION["email"]
    assert "password_hash" not in body


@pytest.mark.asyncio
async def test_change_password_succeeds_with_correct_current_password(
    client: AsyncClient,
) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    token = registered.json()["access_token"]

    response = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": REGISTRATION["password"],
            "new_password": "a-brand-new-password",
        },
    )

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_change_password_rejects_wrong_current_password(client: AsyncClient) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    token = registered.json()["access_token"]

    response = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "not-the-password", "new_password": "a-brand-new-password"},
    )

    assert response.status_code == 400
    assert response.json()["type"] == "incorrect_password"


@pytest.mark.asyncio
async def test_change_password_allows_login_with_the_new_password(client: AsyncClient) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    token = registered.json()["access_token"]

    await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": REGISTRATION["password"],
            "new_password": "a-brand-new-password",
        },
    )

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": REGISTRATION["email"], "password": "a-brand-new-password"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


@pytest.mark.asyncio
async def test_change_password_revokes_existing_refresh_tokens(client: AsyncClient) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    body = registered.json()
    access_token = body["access_token"]
    old_refresh_token = body["refresh_token"]

    await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": REGISTRATION["password"],
            "new_password": "a-brand-new-password",
        },
    )

    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": old_refresh_token}
    )

    assert response.status_code == 401
