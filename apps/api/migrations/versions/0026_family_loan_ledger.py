"""A family loan and each repayment land in both members' ledgers.

Adds 'loan' and 'loan_payment' to `transaction_source`, gives every household
the reserved "Préstamo familiar" category in both kinds, and mirrors existing
loans and repayments the way `loans.create_loan` and `loans.add_loan_payment`
do from now on:

    loan       -> expense for the lender,   income for the borrower
    repayment  -> expense for the borrower, income for the lender

Revision ID: 0026_family_loan_ledger
Revises: 0025_savings_withdrawal_income
"""

from alembic import op

revision = "0026_family_loan_ledger"
down_revision = "0025_savings_withdrawal_income"
branch_labels = None
depends_on = None

CATEGORY = "Préstamo familiar"


def _mirror(source: str, rows_sql: str) -> None:
    """`rows_sql` yields (source_id, household_id, member_id, kind, amount_minor,
    occurred_on) for every ledger row to write."""
    op.execute(
        f"""
        WITH pending AS (
            SELECT gen_random_uuid() AS transaction_id, r.*, c.id AS category_id
            FROM ({rows_sql}) r
            JOIN categories c
              ON c.household_id = r.household_id AND c.kind = r.kind::text::category_kind
             AND c.name = '{CATEGORY}'
            WHERE NOT EXISTS (
                SELECT 1 FROM transactions t
                WHERE t.source = '{source}' AND t.source_id = r.source_id
                  AND t.member_id = r.member_id
            )
        ),
        mirrored AS (
            INSERT INTO transactions (
                id, household_id, member_id, kind, category_id, amount_minor,
                occurred_on, source, source_id
            )
            SELECT transaction_id, household_id, member_id, kind, category_id,
                   amount_minor, occurred_on, '{source}', source_id
            FROM pending
            RETURNING id, household_id, category_id
        )
        INSERT INTO transaction_categories (id, household_id, transaction_id, category_id)
        SELECT gen_random_uuid(), household_id, id, category_id FROM mirrored
        """
    )


def upgrade() -> None:
    # New enum values cannot be used in the transaction that adds them.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE transaction_source ADD VALUE IF NOT EXISTS 'loan'")
        op.execute("ALTER TYPE transaction_source ADD VALUE IF NOT EXISTS 'loan_payment'")

    op.execute(
        f"""
        INSERT INTO categories (id, household_id, kind, name, is_system)
        SELECT gen_random_uuid(), h.id, k.kind::category_kind, '{CATEGORY}', true
        FROM households h CROSS JOIN (VALUES ('expense'), ('income')) AS k(kind)
        ON CONFLICT ON CONSTRAINT uq_category_household_kind_name DO NOTHING
        """
    )

    _mirror(
        "loan",
        """
        SELECT id AS source_id, household_id, lender_member_id AS member_id,
               'expense'::transaction_kind AS kind, amount_minor, lent_on AS occurred_on
        FROM member_loans
        UNION ALL
        SELECT id, household_id, borrower_member_id,
               'income'::transaction_kind, amount_minor, lent_on
        FROM member_loans
        """,
    )
    _mirror(
        "loan_payment",
        """
        SELECT p.id AS source_id, p.household_id, l.borrower_member_id AS member_id,
               'expense'::transaction_kind AS kind, p.amount_minor, p.paid_on AS occurred_on
        FROM member_loan_payments p JOIN member_loans l ON l.id = p.loan_id
        UNION ALL
        SELECT p.id, p.household_id, l.lender_member_id,
               'income'::transaction_kind, p.amount_minor, p.paid_on
        FROM member_loan_payments p JOIN member_loans l ON l.id = p.loan_id
        """,
    )


def downgrade() -> None:
    # transaction_categories rows go with their transactions (ON DELETE CASCADE).
    op.execute("DELETE FROM transactions WHERE source IN ('loan', 'loan_payment')")
    op.execute(
        f"""
        DELETE FROM categories c
        WHERE c.name = '{CATEGORY}'
          AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.category_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM transaction_categories tc WHERE tc.category_id = c.id)
        """
    )
    # Postgres cannot remove a value from an enum; 'loan' and 'loan_payment'
    # stay on transaction_source, harmlessly, as in 0010.
