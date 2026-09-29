from family_api.schemas.credit_card import CreateCreditCardPurchaseRequest


def test_installment_plan_must_be_all_or_nothing() -> None:
    import pytest
    from datetime import date
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        CreateCreditCardPurchaseRequest(
            description="TV", amount_minor=1_000_000, purchased_on=date(2026, 1, 1),
            installments_total=6,
        )

    ok = CreateCreditCardPurchaseRequest(
        description="TV", amount_minor=1_000_000, purchased_on=date(2026, 1, 1),
        installments_total=6, installment_amount_minor=166_667,
        first_installment_on=date(2026, 1, 1),
    )
    assert ok.installments_total == 6
