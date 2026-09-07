"""Create all enum types and the citext extension.

Revision ID: 0001_enums
Revises:
"""

from alembic import op

revision = "0001_enums"
down_revision = None
branch_labels = None
depends_on = None

ENUMS: dict[str, tuple[str, ...]] = {
    "member_role": ("admin", "adult", "teen", "guest"),
    "member_status": ("active", "invited", "inactive"),
    "category_kind": ("income", "expense"),
    "transaction_kind": ("income", "expense"),
    "transaction_source": ("manual", "contribution"),
    "savings_entry_kind": ("deposit", "withdrawal"),
    "debt_creditor_type": ("bank", "family", "credit_card", "addi", "other"),
    "debt_status": ("active", "paid", "cancelled"),
    "loan_status": ("pending", "partially_paid", "paid", "cancelled"),
    "visibility_module": ("income", "expenses", "savings", "debts"),
    "visibility_level": ("private", "summary", "public"),
    "period_status": ("open", "closed"),
}


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    for name, values in ENUMS.items():
        rendered = ", ".join(f"'{v}'" for v in values)
        op.execute(f"CREATE TYPE {name} AS ENUM ({rendered})")


def downgrade() -> None:
    for name in reversed(list(ENUMS)):
        op.execute(f"DROP TYPE IF EXISTS {name}")
    op.execute("DROP EXTENSION IF EXISTS citext")
