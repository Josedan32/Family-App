from family_api.db.models.credit_card import (
    CreditCard,
    CreditCardPayment,
    CreditCardPurchase,
    CreditCardStatement,
)


def test_model_table_names() -> None:
    assert CreditCard.__tablename__ == "credit_cards"
    assert CreditCardPurchase.__tablename__ == "credit_card_purchases"
    assert CreditCardPayment.__tablename__ == "credit_card_payments"
    assert CreditCardStatement.__tablename__ == "credit_card_statements"


def test_credit_card_statement_generated_at_column() -> None:
    assert hasattr(CreditCardStatement, "generated_at")
