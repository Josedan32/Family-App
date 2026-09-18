"""A savings withdrawal counts as income in the month it happens.

Adds 'savings_withdrawal' to `transaction_source`, gives every household the
reserved income category "Retiro de ahorro", and mirrors each existing
withdrawal into its owner's ledger as a read-only income row — the same shape
`savings.add_entry` writes from now on (no name, no note).

Revision ID: 0025_savings_withdrawal_income
Revises: 0024_savings_goal_used
"""

from alembic import op

revision = "0025_savings_withdrawal_income"
down_revision = "0024_savings_goal_used"
branch_labels = None
depends_on = None

CATEGORY = "Retiro de ahorro"


def upgrade() -> None:
    # A new enum value cannot be used in the transaction that adds it, and the
    # backfill below uses it: commit the ALTER on its own first.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE transaction_source ADD VALUE IF NOT EXISTS 'savings_withdrawal'")

    op.execute(
        f"""
        INSERT INTO categories (id, household_id, kind, name, is_system)
        SELECT gen_random_uuid(), h.id, 'income', '{CATEGORY}', true
        FROM households h
        ON CONFLICT ON CONSTRAINT uq_category_household_kind_name DO NOTHING
        """
    )

    op.execute(
        f"""
        WITH pending AS (
            SELECT gen_random_uuid() AS transaction_id, e.id AS entry_id,
                   g.household_id, g.member_id, e.amount_minor, e.occurred_on,
                   c.id AS category_id
            FROM savings_entries e
            JOIN savings_goals g ON g.id = e.goal_id
            JOIN categories c
              ON c.household_id = g.household_id AND c.kind = 'income'
             AND c.name = '{CATEGORY}'
            WHERE e.kind = 'withdrawal'
              AND NOT EXISTS (
                  SELECT 1 FROM transactions t
                  WHERE t.source = 'savings_withdrawal' AND t.source_id = e.id
              )
        ),
        mirrored AS (
            INSERT INTO transactions (
                id, household_id, member_id, kind, category_id, amount_minor,
                occurred_on, source, source_id
            )
            SELECT transaction_id, household_id, member_id, 'income', category_id,
                   amount_minor, occurred_on, 'savings_withdrawal', entry_id
            FROM pending
            RETURNING id, household_id, category_id
        )
        INSERT INTO transaction_categories (id, household_id, transaction_id, category_id)
        SELECT gen_random_uuid(), household_id, id, category_id FROM mirrored
        """
    )


def downgrade() -> None:
    # transaction_categories rows go with their transactions (ON DELETE CASCADE).
    op.execute("DELETE FROM transactions WHERE source = 'savings_withdrawal'")
    op.execute(
        f"""
        DELETE FROM categories c
        WHERE c.kind = 'income' AND c.name = '{CATEGORY}'
          AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.category_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM transaction_categories tc WHERE tc.category_id = c.id)
        """
    )
    # Postgres cannot remove a value from an enum; 'savings_withdrawal' stays
    # on transaction_source, harmlessly, as in 0010.
