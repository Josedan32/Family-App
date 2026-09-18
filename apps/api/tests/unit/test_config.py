import pytest

from family_api.config import Settings, get_settings

SECRET = "x" * 48


def settings(**overrides: str) -> Settings:
    values = {"database_url": "postgresql+asyncpg://u:p@localhost/db", "jwt_secret": SECRET}
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


def test_a_local_asyncpg_url_is_left_alone() -> None:
    url = "postgresql+asyncpg://family:family@localhost:5432/family"
    assert settings(database_url=url).database_url == url


@pytest.mark.parametrize("scheme", ["postgres", "postgresql"])
def test_a_bare_postgres_url_is_pointed_at_asyncpg(scheme: str) -> None:
    # Hosting dashboards hand out the plain scheme, which SQLAlchemy would
    # route to psycopg2 — a driver this project does not install.
    url = settings(database_url=f"{scheme}://u:p@host/db").database_url
    assert url == "postgresql+asyncpg://u:p@host/db"


def test_a_neon_url_pasted_as_is_becomes_one_asyncpg_accepts() -> None:
    # asyncpg rejects `sslmode` and `channel_binding` as unexpected keyword
    # arguments, so the string Neon offers to copy would crash on first connect.
    pasted = (
        "postgresql://neondb_owner:npg_abc@ep-cool-name-123.us-east-2.aws.neon.tech"
        "/neondb?sslmode=require&channel_binding=require"
    )
    assert settings(database_url=pasted).database_url == (
        "postgresql+asyncpg://neondb_owner:npg_abc@ep-cool-name-123.us-east-2.aws.neon.tech"
        "/neondb?ssl=require"
    )


def test_production_refuses_a_short_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "change-me-in-production")
    get_settings.cache_clear()
    try:
        with pytest.raises(ValueError, match="32 characters"):
            get_settings()
    finally:
        get_settings.cache_clear()
