"""Money is integer minor units plus a currency code. Never a float.

A float cannot represent 0.1 exactly, so a system that adds money in floats
accumulates error that shows up as a family's totals disagreeing with their
own arithmetic. Integers make that impossible.
"""

MINOR_UNITS: dict[str, int] = {
    "COP": 0,
    "USD": 2,
    "EUR": 2,
}

SUPPORTED_CURRENCIES = frozenset(MINOR_UNITS)


def minor_units(currency: str) -> int:
    """Number of decimal places for a currency. COP has none."""
    try:
        return MINOR_UNITS[currency.upper()]
    except KeyError:
        raise ValueError(f"Unsupported currency: {currency}") from None


def validate_amount(amount_minor: int) -> None:
    """Amounts are strictly positive integers. Direction lives in a kind column."""
    if isinstance(amount_minor, bool) or not isinstance(amount_minor, int):
        raise TypeError("Amount must be an integer number of minor units")
    if amount_minor <= 0:
        raise ValueError("Amount must be positive")
