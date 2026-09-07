import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from family_api.errors import LastAdminError, NotVisibleError, register_error_handlers


@pytest.fixture
def error_app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom-visibility")
    async def boom_visibility() -> None:
        raise NotVisibleError

    @app.get("/boom-admin")
    async def boom_admin() -> None:
        raise LastAdminError

    return app


@pytest.mark.asyncio
async def test_domain_error_renders_problem_json(error_app: FastAPI) -> None:
    transport = ASGITransport(app=error_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom-visibility")

    assert response.status_code == 403
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["type"] == "not_visible"
    assert body["status"] == 403
    assert body["instance"] == "/boom-visibility"
    assert body["title"]


@pytest.mark.asyncio
async def test_conflict_error_carries_its_own_slug(error_app: FastAPI) -> None:
    transport = ASGITransport(app=error_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom-admin")

    assert response.status_code == 409
    assert response.json()["type"] == "last_admin"


@pytest.mark.asyncio
async def test_titles_are_spanish(error_app: FastAPI) -> None:
    """Titles are user-facing copy; clients branch on `type`, never on `title`."""
    assert NotVisibleError.title == "No tienes acceso a esta información"
