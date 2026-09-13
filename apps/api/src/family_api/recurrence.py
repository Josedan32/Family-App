"""When a chore falls due inside a cycle.

Monthly steps by calendar month, not by 30 days, so "the 15th" stays the 15th
instead of drifting backwards through the year.
"""

from datetime import date, timedelta

from family_api.dates import add_months

STEP_DAYS = {"daily": 1, "weekly": 7, "biweekly": 14}


def occurrences(frequency: str, starts_on: date, ends_on: date) -> list[date]:
    if frequency not in STEP_DAYS and frequency != "monthly":
        raise ValueError(f"Unknown frequency: {frequency}")
    if ends_on < starts_on:
        return []

    dates: list[date] = []
    if frequency == "monthly":
        index = 0
        while True:
            current = add_months(starts_on, index)
            if current > ends_on:
                break
            dates.append(current)
            index += 1
        return dates

    step = timedelta(days=STEP_DAYS[frequency])
    current = starts_on
    while current <= ends_on:
        dates.append(current)
        current += step
    return dates
