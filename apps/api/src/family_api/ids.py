"""The only place UUID generation lives.

UUIDv7 is time-ordered, so primary keys cluster by insertion time and index
pages stay warm. If the `uuid6` package is ever unavailable, swapping to
`uuid.uuid4` is a one-line change here and nowhere else.
"""

from uuid import UUID

from uuid6 import uuid7


def new_id() -> UUID:
    return uuid7()
