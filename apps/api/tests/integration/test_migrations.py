import pytest
from sqlalchemy import text

from family_api.config import get_settings
from family_api.db.session import engine_for


@pytest.mark.asyncio
async def test_all_enum_types_exist_after_migration() -> None:
    """Run `alembic upgrade head` against the test database before this test."""
    engine = engine_for(get_settings().test_database_url)
    expected = {
        "member_role", "member_status", "category_kind", "transaction_kind",
        "transaction_source", "savings_entry_kind", "debt_creditor_type",
        "debt_status", "loan_status", "visibility_module", "visibility_level",
        "period_status",
    }
    async with engine.connect() as conn:
        rows = await conn.execute(text("SELECT typname FROM pg_type WHERE typtype = 'e'"))
        actual = {row[0] for row in rows}
    await engine.dispose()

    assert expected <= actual


@pytest.mark.asyncio
async def test_citext_extension_is_installed() -> None:
    engine = engine_for(get_settings().test_database_url)
    async with engine.connect() as conn:
        result = await conn.scalar(
            text("SELECT count(*) FROM pg_extension WHERE extname = 'citext'")
        )
    await engine.dispose()

    assert result == 1
