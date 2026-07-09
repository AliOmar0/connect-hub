"""
Page fetching with retry backoff for the Bank Scraper Vector Knowledge Base
feature.

``fetch_with_retry`` is the sole I/O boundary in this module (an
``httpx.AsyncClient`` is injected by the caller so it can be swapped for a
fake/mock in tests). The backoff schedule itself (Property 12: strictly
increasing delay, bounded by the configured maximum retries) is pure and
delegated to ``asyncio.sleep`` so it is easily mockable/patchable in tests.

See design.md -> "4. `PageFetcher` (`app/core/scraper/fetcher.py`)".
"""

import asyncio
from dataclasses import dataclass

import httpx


class FetchError(Exception):
    """Raised when a URL could not be fetched after exhausting all retries."""


@dataclass
class FetchResult:
    url: str
    status_code: int
    html: str


async def fetch_with_retry(
    url: str,
    http_client: httpx.AsyncClient,
    max_retries: int,
    base_backoff_seconds: float,
) -> FetchResult:
    """Fetch `url`, retrying on network error or 5xx responses.

    Makes up to `max_retries` attempts total. Between attempts (not after
    the final one), sleeps `base_backoff_seconds * attempt_number` seconds,
    where `attempt_number` starts at 1 for the delay following the first
    attempt. Raises `FetchError` (never the underlying httpx exception) once
    all retries are exhausted.
    """
    last_error: str = "unknown error"

    for attempt_number in range(1, max_retries + 1):
        try:
            response = await http_client.get(url)
        except httpx.HTTPError as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        else:
            if response.status_code < 500:
                return FetchResult(
                    url=url,
                    status_code=response.status_code,
                    html=response.text,
                )
            last_error = f"HTTP {response.status_code}"

        if attempt_number < max_retries:
            await asyncio.sleep(base_backoff_seconds * attempt_number)

    raise FetchError(
        f"Failed to fetch {url} after {max_retries} attempts: {last_error}"
    )
