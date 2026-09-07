"""In-memory fixed-window rate limiter.

Per-process, so it does not survive multiple workers. That is acceptable for a
single-household deployment; Phase 3 introduces Redis (spec §7.5) and this
moves there.
"""

import time
from collections import defaultdict

from family_api.errors import RateLimitedError

_hits: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    recent = [t for t in _hits[key] if now - t < window_seconds]
    if len(recent) >= limit:
        raise RateLimitedError
    recent.append(now)
    _hits[key] = recent


def reset_rate_limits() -> None:
    """Test hook."""
    _hits.clear()
