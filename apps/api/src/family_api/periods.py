"""Period boundaries.

`month_bounds` is pure date arithmetic and needs no timezone — a month has the
same first and last day everywhere. Only "what month is it now" depends on the
household's timezone, which is why that is a separate function.
"""

import calendar
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

PERIOD_PATTERN = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def month_bounds(period: str) -> tuple[date, date]:
    match = PERIOD_PATTERN.match(period)
    if match is None:
        raise ValueError(f"Invalid period: {period!r}. Expected YYYY-MM.")
    year, month = int(match.group(1)), int(match.group(2))
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def today_in(timezone: str) -> date:
    """The day it is *for this household*, not for the server."""
    return datetime.now(ZoneInfo(timezone)).date()


def current_period(timezone: str) -> str:
    """The month it is *for this household*, not for the server."""
    now = datetime.now(ZoneInfo(timezone))
    return f"{now.year:04d}-{now.month:02d}"


def parse_period(period: str | None, timezone: str) -> tuple[date, date]:
    return month_bounds(period or current_period(timezone))
