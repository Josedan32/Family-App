import pytest

from family_api.money import minor_units, validate_amount


def test_cop_has_zero_minor_units() -> None:
    """COP is not divided in practice, so amount_minor holds whole pesos."""
    assert minor_units("COP") == 0


def test_usd_has_two_minor_units() -> None:
    assert minor_units("USD") == 2


def test_currency_lookup_is_case_insensitive() -> None:
    assert minor_units("cop") == 0


def test_unknown_currency_raises() -> None:
    with pytest.raises(ValueError, match="Unsupported currency"):
        minor_units("XYZ")


def test_positive_amount_is_valid() -> None:
    validate_amount(2_000_000)


@pytest.mark.parametrize("amount", [0, -1, -2_000_000])
def test_non_positive_amount_raises(amount: int) -> None:
    """Direction lives in a kind column, never in a sign."""
    with pytest.raises(ValueError, match="must be positive"):
        validate_amount(amount)


def test_amount_must_be_an_integer_not_a_float() -> None:
    with pytest.raises(TypeError, match="must be an integer"):
        validate_amount(1000.50)  # type: ignore[arg-type]
