from family_api.security.passwords import hash_password, verify_password


def test_hash_is_not_the_plaintext() -> None:
    hashed = hash_password("correct-horse-battery")
    assert hashed != "correct-horse-battery"
    assert hashed.startswith("$argon2id$")


def test_correct_password_verifies() -> None:
    assert verify_password("correct-horse-battery", hash_password("correct-horse-battery"))


def test_wrong_password_does_not_verify() -> None:
    assert not verify_password("wrong", hash_password("correct-horse-battery"))


def test_same_password_hashes_differently_each_time() -> None:
    """A per-hash salt means identical passwords are not identifiable in a dump."""
    assert hash_password("same") != hash_password("same")


def test_malformed_hash_returns_false_rather_than_raising() -> None:
    assert not verify_password("anything", "not-a-hash")
