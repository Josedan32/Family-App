"""Calendar arithmetic that respects short months.

A debt due on the 31st is due on the 28th in February. Adding 30 days instead
of a month drifts the due date a little further every cycle until it lands in
the wrong month entirely.
"""

import calendar
from datetime import date


def add_months(start: date, months: int) -> date:
    total = start.month - 1 + months
    year = start.year + total // 12
    month = total % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)
