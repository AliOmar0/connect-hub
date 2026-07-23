"""
Crawl frontier and link-filtering helpers for the Bank Scraper Vector
Knowledge Base feature.

These are pure functions/classes operating on plain data (no I/O), which
makes them the primary target for property-based testing (design.md
Correctness Properties 1-4).

See design.md -> "3. `LinkFilter` / crawl-graph helpers
(`app/core/scraper/frontier.py`)".
"""

from typing import Iterable, List, Set
from urllib.parse import urlparse

# Path segments that are always excluded from the crawl regardless of
# locale prefix (e.g. matches both /ar/media-center/news and
# /en/media-center/news). News/media-center content churns constantly and
# is not stable banking-product knowledge, so it is deliberately kept out of
# the knowledge base rather than filtered post-hoc after being ingested.
EXCLUDED_PATH_SEGMENTS: tuple = ("media-center/news",)


def _hostname(url: str) -> str:
    """Extract the lowercased hostname from a URL (empty string if absent)."""
    parsed = urlparse(url)
    return (parsed.hostname or "").lower()


def same_domain(url: str, base_domain: str) -> bool:
    """True if url's host matches base_domain (case-insensitive), else False."""
    return _hostname(url) == base_domain.lower()


def filter_same_domain(urls: Iterable[str], base_domain: str) -> List[str]:
    """Return the subset of urls whose host matches base_domain, order
    preserved (design.md Property 1 — this function's contract is exactly
    "same domain", nothing more; excluded-path filtering is a separate,
    explicit step via `filter_excluded_paths` so each filter's behavior
    stays independently testable)."""
    return [url for url in urls if same_domain(url, base_domain)]


def filter_excluded_paths(urls: Iterable[str], excluded_segments: tuple = EXCLUDED_PATH_SEGMENTS) -> List[str]:
    """Return the subset of urls whose path does NOT contain any of
    `excluded_segments` (case-insensitive substring match), order preserved.
    Used to keep churny, non-knowledge content like news/media-center pages
    out of the crawl regardless of locale prefix (/ar/, /en/)."""
    return [
        url
        for url in urls
        if not any(segment in urlparse(url).path.lower() for segment in excluded_segments)
    ]


def filter_allowed(urls: Iterable[str], policy, user_agent: str) -> List[str]:
    """Return the subset of urls allowed by the given robots policy.

    Delegates per-URL decisions to ``robots.is_allowed``. Imported lazily so
    that importing this module does not require ``robots.py`` to exist yet
    (it lands in task 4) and so callers of the other pure functions in this
    module aren't blocked on that dependency.
    """
    from app.core.scraper import robots

    return [url for url in urls if robots.is_allowed(policy, url, user_agent)]


class CrawlFrontier:
    """Tracks visited URLs, current depth per URL, and remaining page budget."""

    def __init__(self, start_url: str, max_depth: int, max_pages: int) -> None:
        self.start_url = start_url
        self.max_depth = max_depth
        self.max_pages = max_pages
        self._visited: Set[str] = set()

    def should_visit(self, url: str, depth: int) -> bool:
        """False if already visited, depth > max_depth, or page budget exhausted."""
        if url in self._visited:
            return False
        if depth > self.max_depth:
            return False
        if len(self._visited) >= self.max_pages:
            return False
        return True

    def mark_visited(self, url: str) -> None:
        self._visited.add(url)

    def remaining_budget(self) -> int:
        return max(0, self.max_pages - len(self._visited))
