from uuid import UUID

from family_api.ids import new_id


def test_new_id_returns_uuid() -> None:
    assert isinstance(new_id(), UUID)


def test_new_id_is_unique() -> None:
    assert len({new_id() for _ in range(1000)}) == 1000


def test_new_ids_are_time_ordered() -> None:
    """UUIDv7 is time-ordered, which gives index locality on inserts."""
    ids = [new_id() for _ in range(100)]
    assert ids == sorted(ids)
