import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from family_api.config import get_settings
from family_api.errors import TokenExpiredError

ALGORITHM = "HS256"


def create_access_token(user_id: UUID, ttl: timedelta | None = None) -> str:
    settings = get_settings()
    if ttl is None:
        ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> UUID:
    """Any failure is reported as expiry.

    Distinguishing "expired" from "tampered" tells an attacker whether their
    forgery was structurally valid.
    """
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
        return UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise TokenExpiredError from exc


def generate_refresh_token() -> tuple[str, str]:
    """Return (raw, hash). Only the hash is ever persisted."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
