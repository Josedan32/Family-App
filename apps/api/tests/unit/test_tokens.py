from datetime import timedelta

import pytest

from family_api.errors import TokenExpiredError
from family_api.ids import new_id
from family_api.security.tokens import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
)


def test_access_token_round_trips_the_user_id() -> None:
    user_id = new_id()
    assert decode_access_token(create_access_token(user_id)) == user_id


def test_expired_access_token_raises() -> None:
    token = create_access_token(new_id(), ttl=timedelta(seconds=-1))
    with pytest.raises(TokenExpiredError):
        decode_access_token(token)


def test_tampered_access_token_raises() -> None:
    token = create_access_token(new_id())
    with pytest.raises(TokenExpiredError):
        decode_access_token(token + "x")


def test_refresh_token_returns_raw_and_hash() -> None:
    raw, hashed = generate_refresh_token()
    assert raw != hashed
    assert hash_refresh_token(raw) == hashed


def test_refresh_tokens_are_unique() -> None:
    assert len({generate_refresh_token()[0] for _ in range(100)}) == 100
