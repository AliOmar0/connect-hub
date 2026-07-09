"""
Rate limiting helper for the Bank Scraper Vector Knowledge Base feature.

Enforces a minimum delay between consecutive requests (design.md
Correctness Property 6). The clock is injectable so tests can use a fake,
controllable clock instead of real sleeping.

See design.md -> "2. `RateLimiter` (`app/core/scraper/rate_limiter.py`)".
"""

import asyncio
import time
from typing import Callable, Optional


class RateLimiter:
    """Blocks callers of ``wait()`` until at least ``delay_seconds`` have
    elapsed since the previous call to ``wait()``.

    The first call to ``wait()`` never blocks, since there is no previous
    call to measure against.
    """

    def __init__(
        self,
        delay_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.delay_seconds = delay_seconds
        self._clock = clock
        self._last_call_time: Optional[float] = None

    async def wait(self) -> None:
        """Blocks until at least delay_seconds has elapsed since the previous call."""
        now = self._clock()

        if self._last_call_time is None:
            self._last_call_time = now
            return

        elapsed = now - self._last_call_time
        if elapsed < self.delay_seconds:
            await asyncio.sleep(self.delay_seconds - elapsed)

        # Record the target time (previous call time + delay) rather than
        # re-reading the clock, so enforcement is exact even with a fake
        # clock that doesn't advance on its own during the sleep.
        self._last_call_time = max(now, self._last_call_time + self.delay_seconds)
