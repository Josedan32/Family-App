from family_api.services.invites import INVITE_ALPHABET, generate_code

AMBIGUOUS = set("0O1IL")


def test_code_is_eight_characters() -> None:
    assert len(generate_code()) == 8


def test_alphabet_excludes_ambiguous_glyphs() -> None:
    """FR-M1-03: codes get read aloud across a room."""
    assert not (set(INVITE_ALPHABET) & AMBIGUOUS)


def test_generated_codes_use_only_the_alphabet() -> None:
    assert all(set(generate_code()) <= set(INVITE_ALPHABET) for _ in range(200))


def test_codes_are_uppercase() -> None:
    code = generate_code()
    assert code == code.upper()


def test_codes_are_not_trivially_repeating() -> None:
    assert len({generate_code() for _ in range(500)}) > 490
