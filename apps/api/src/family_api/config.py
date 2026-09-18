from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# libpq spellings that hosting dashboards put in the URL. asyncpg rejects both
# as unexpected keyword arguments; it spells the first one `ssl`.
_LIBPQ_ONLY_PARAMS = {"channel_binding"}


class Settings(BaseSettings):
    # "development" | "production". Guards anything that must never touch real
    # household data — the demo seed above all, which creates four accounts
    # with a password committed to this repository.
    environment: str = "development"
    database_url: str
    test_database_url: str = ""
    jwt_secret: str
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cors_origins: list[str] = []
    rate_limit_auth_per_minute: int = 10
    rate_limit_invite_per_hour: int = 20
    default_currency: str = "COP"
    default_timezone: str = "America/Bogota"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    @field_validator("database_url")
    @classmethod
    def _use_asyncpg(cls, url: str) -> str:
        """Accept the connection string exactly as the database host shows it."""
        parts = urlsplit(url)
        scheme = parts.scheme
        if scheme in ("postgres", "postgresql"):
            scheme = "postgresql+asyncpg"
        query = [
            ("ssl" if key == "sslmode" else key, value)
            for key, value in parse_qsl(parts.query)
            if key not in _LIBPQ_ONLY_PARAMS
        ]
        return urlunsplit(parts._replace(scheme=scheme, query=urlencode(query)))


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and len(settings.jwt_secret) < 32:
        # Refuse to boot rather than sign a family's sessions with a key short
        # enough to be worth attacking. The example secret in .env.example is
        # 23 characters, and the test suite has been warning about it all along.
        raise ValueError(
            "JWT_SECRET must be at least 32 characters in production. Generate "
            'one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    return settings
