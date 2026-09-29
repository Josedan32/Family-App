"""Credit cards module.

Revision ID: 0027_credit_cards
Revises: 0026_family_loan_ledger
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0027_credit_cards"
down_revision = "0026_family_loan_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE credit_card_status AS ENUM ('active', 'cancelled')")

    op.create_table(
        "credit_cards",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("household_id", sa.UUID(), nullable=False),
        sa.Column("member_id", sa.UUID(), nullable=False),
        sa.Column("nickname", sa.String(length=120), nullable=False),
        sa.Column("bank_label", sa.String(length=120), nullable=False),
        sa.Column("credit_limit_minor", sa.BigInteger(), nullable=False),
        sa.Column("interest_rate_monthly_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("minimum_payment_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("minimum_payment_floor_minor", sa.BigInteger(), nullable=True),
        sa.Column("statement_cutoff_day", sa.SmallInteger(), nullable=False),
        sa.Column("payment_due_days", sa.SmallInteger(), server_default="15", nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("active", "cancelled", name="credit_card_status", create_type=False),
            server_default="active",
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("credit_limit_minor > 0", name="ck_credit_card_limit_positive"),
        sa.CheckConstraint("interest_rate_monthly_pct >= 0", name="ck_credit_card_rate_nonneg"),
        sa.CheckConstraint("minimum_payment_pct >= 0", name="ck_credit_card_min_pct_nonneg"),
        sa.CheckConstraint(
            "minimum_payment_floor_minor IS NULL OR minimum_payment_floor_minor > 0",
            name="ck_credit_card_floor_positive",
        ),
        sa.CheckConstraint(
            "statement_cutoff_day BETWEEN 1 AND 28", name="ck_credit_card_cutoff_day"
        ),
        sa.CheckConstraint("payment_due_days > 0", name="ck_credit_card_due_days_positive"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["household_members.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "credit_card_purchases",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("household_id", sa.UUID(), nullable=False),
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("purchased_on", sa.Date(), nullable=False),
        sa.Column("installments_total", sa.SmallInteger(), nullable=True),
        sa.Column("installment_amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("first_installment_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="ck_ccp_amount_positive"),
        sa.CheckConstraint(
            "installments_total IS NULL AND installment_amount_minor IS NULL "
            "AND first_installment_on IS NULL "
            "OR installments_total IS NOT NULL AND installment_amount_minor IS NOT NULL "
            "AND first_installment_on IS NOT NULL",
            name="ck_ccp_installment_plan_complete",
        ),
        sa.CheckConstraint(
            "installments_total IS NULL OR installments_total > 0",
            name="ck_ccp_installments_positive",
        ),
        sa.CheckConstraint(
            "installment_amount_minor IS NULL OR installment_amount_minor > 0",
            name="ck_ccp_installment_amount_positive",
        ),
        sa.ForeignKeyConstraint(["card_id"], ["credit_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ccp_card_purchased_on", "credit_card_purchases", ["card_id", "purchased_on"]
    )

    op.create_table(
        "credit_card_payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("household_id", sa.UUID(), nullable=False),
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="ck_ccpay_amount_positive"),
        sa.ForeignKeyConstraint(["card_id"], ["credit_cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ccpay_card_paid_on", "credit_card_payments", ["card_id", "paid_on"])

    op.create_table(
        "credit_card_statements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("household_id", sa.UUID(), nullable=False),
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("cycle_starts_on", sa.Date(), nullable=False),
        sa.Column("cycle_ends_on", sa.Date(), nullable=False),
        sa.Column("opening_balance_minor", sa.BigInteger(), nullable=False),
        sa.Column("purchases_total_minor", sa.BigInteger(), nullable=False),
        sa.Column("installments_due_minor", sa.BigInteger(), nullable=False),
        sa.Column("interest_charged_minor", sa.BigInteger(), nullable=False),
        sa.Column("payments_total_minor", sa.BigInteger(), nullable=False),
        sa.Column("closing_balance_minor", sa.BigInteger(), nullable=False),
        sa.Column("minimum_payment_minor", sa.BigInteger(), nullable=False),
        sa.Column("payment_due_on", sa.Date(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("opening_balance_minor >= 0", name="ck_ccs_opening_nonneg"),
        sa.CheckConstraint("purchases_total_minor >= 0", name="ck_ccs_purchases_nonneg"),
        sa.CheckConstraint("installments_due_minor >= 0", name="ck_ccs_installments_nonneg"),
        sa.CheckConstraint("interest_charged_minor >= 0", name="ck_ccs_interest_nonneg"),
        sa.CheckConstraint("payments_total_minor >= 0", name="ck_ccs_payments_nonneg"),
        sa.CheckConstraint("closing_balance_minor >= 0", name="ck_ccs_closing_nonneg"),
        sa.CheckConstraint("minimum_payment_minor >= 0", name="ck_ccs_minpay_nonneg"),
        sa.ForeignKeyConstraint(["card_id"], ["credit_cards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("card_id", "cycle_starts_on", name="uq_ccs_card_cycle"),
    )
    op.create_index(
        "ix_ccs_card_cycle_desc", "credit_card_statements", ["card_id", "cycle_starts_on"]
    )


def downgrade() -> None:
    op.drop_index("ix_ccs_card_cycle_desc", table_name="credit_card_statements")
    op.drop_table("credit_card_statements")
    op.drop_index("ix_ccpay_card_paid_on", table_name="credit_card_payments")
    op.drop_table("credit_card_payments")
    op.drop_index("ix_ccp_card_purchased_on", table_name="credit_card_purchases")
    op.drop_table("credit_card_purchases")
    op.drop_table("credit_cards")
    op.execute("DROP TYPE credit_card_status")
