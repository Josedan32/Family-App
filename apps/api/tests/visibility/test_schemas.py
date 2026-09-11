"""A summary schema must be structurally incapable of leaking detail.

docs/visibility-rules.md §3.1 lists what must never appear. Asserting on the
field SET, not on values, is what catches a leak added later by an unrelated
feature.
"""

from family_api.schemas.transaction import MoneyTotalResponse

FORBIDDEN_SUBSTRINGS = (
    "count", "category", "note", "min", "max", "avg", "average",
    "cursor", "has_more", "items", "trend", "largest", "occurred",
)


def test_money_total_has_exactly_three_fields() -> None:
    assert set(MoneyTotalResponse.model_fields) == {"period", "total_minor", "currency"}


def test_money_total_carries_no_forbidden_field() -> None:
    for name in MoneyTotalResponse.model_fields:
        # "_minor" is the mandated money-unit suffix (Global Constraints #1),
        # not a leak signal — strip it before checking, or "total_minor"
        # false-positives on the "min" substring meant to catch "minimum".
        checked = name.lower().removesuffix("_minor")
        assert not any(bad in checked for bad in FORBIDDEN_SUBSTRINGS), name


def test_summary_shape_is_fixed_regardless_of_data() -> None:
    """One record or a thousand, the payload has the same keys."""
    empty = MoneyTotalResponse(period="2026-09", total_minor=0, currency="COP")
    full = MoneyTotalResponse(period="2026-09", total_minor=5_500_000, currency="COP")
    assert empty.model_dump().keys() == full.model_dump().keys()


def test_detail_and_summary_are_different_classes() -> None:
    """Never one model with fields excluded at serialization time."""
    from family_api.schemas.transaction import TransactionResponse

    assert TransactionResponse is not MoneyTotalResponse
    assert not issubclass(MoneyTotalResponse, TransactionResponse)
