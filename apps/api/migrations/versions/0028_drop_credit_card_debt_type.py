"""Drop 'credit_card' from debt_creditor_type; credit cards are their own module now.

Revision ID: 0028_drop_credit_card_debt_type
Revises: 0027_credit_cards
"""

import sqlalchemy as sa
from alembic import op

revision = "0028_drop_credit_card_debt_type"
down_revision = "0027_credit_cards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()

    # Best-effort backfill: an existing credit_card debt becomes a card whose
    # first statement is synthesized from the debt's principal. No purchase
    # or payment history is reconstructed — there is none to reconstruct.
    rows = connection.execute(
        sa.text(
            "SELECT id, household_id, member_id, creditor_label, principal_minor, "
            "annual_interest_rate, due_day, created_at "
            "FROM debts WHERE creditor_type = 'credit_card'"
        )
    ).fetchall()

    for row in rows:
        card_id = connection.execute(sa.text("SELECT gen_random_uuid()")).scalar()
        connection.execute(
            sa.text(
                "INSERT INTO credit_cards "
                "(id, household_id, member_id, nickname, bank_label, credit_limit_minor, "
                "interest_rate_monthly_pct, minimum_payment_pct, statement_cutoff_day, "
                "payment_due_days, status, created_at, updated_at) "
                "VALUES (:id, :hh, :mem, :nick, :bank, :limit, :rate, :minpct, :cutoff, "
                "15, 'active', :created, now())"
            ),
            {
                "id": card_id,
                "hh": row.household_id,
                "mem": row.member_id,
                "nick": row.creditor_label,
                "bank": row.creditor_label,
                "limit": max(row.principal_minor * 2, 1),
                "rate": row.annual_interest_rate / 12 if row.annual_interest_rate else 0,
                "minpct": 5,
                "cutoff": row.due_day or 1,
                "created": row.created_at,
            },
        )
        statement_id = connection.execute(sa.text("SELECT gen_random_uuid()")).scalar()
        connection.execute(
            sa.text(
                "INSERT INTO credit_card_statements "
                "(id, household_id, card_id, cycle_starts_on, cycle_ends_on, "
                "opening_balance_minor, purchases_total_minor, installments_due_minor, "
                "interest_charged_minor, payments_total_minor, closing_balance_minor, "
                "minimum_payment_minor, payment_due_on) "
                "VALUES (:id, :hh, :card, :start, CURRENT_DATE, 0, :principal, 0, 0, 0, "
                ":principal, :principal, CURRENT_DATE + 15)"
            ),
            {
                "id": statement_id,
                "hh": row.household_id,
                "card": card_id,
                "start": row.created_at,
                "principal": row.principal_minor,
            },
        )
        connection.execute(sa.text("DELETE FROM debt_payments WHERE debt_id = :id"), {"id": row.id})
        connection.execute(sa.text("DELETE FROM debts WHERE id = :id"), {"id": row.id})

    op.execute("ALTER TYPE debt_creditor_type RENAME TO debt_creditor_type_old")
    op.execute("CREATE TYPE debt_creditor_type AS ENUM ('bank', 'family', 'addi', 'other')")
    op.execute(
        "ALTER TABLE debts ALTER COLUMN creditor_type TYPE debt_creditor_type "
        "USING creditor_type::text::debt_creditor_type"
    )
    op.execute("DROP TYPE debt_creditor_type_old")


def downgrade() -> None:
    op.execute("ALTER TYPE debt_creditor_type RENAME TO debt_creditor_type_new")
    op.execute(
        "CREATE TYPE debt_creditor_type AS ENUM ('bank', 'family', 'credit_card', 'addi', 'other')"
    )
    op.execute(
        "ALTER TABLE debts ALTER COLUMN creditor_type TYPE debt_creditor_type "
        "USING creditor_type::text::debt_creditor_type"
    )
    op.execute("DROP TYPE debt_creditor_type_new")
    # The backfilled credit_cards/credit_card_statements rows are not reversed
    # back into debts rows — downgrading past this point is a schema-only
    # rollback, not a data-preserving one, same as any lossy migration.
