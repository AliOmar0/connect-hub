"""
Robots.txt compliance and delay computation for the Bank Scraper Vector
Knowledge Base feature.

Wraps the standard library's ``urllib.robotparser.RobotFileParser`` (no new
dependency, per design.md decision #3) with an async fetch helper and pure
helpers for permission checks and effective-delay computation.

See design.md -> "1. `RobotsPolicy` (`app/core/scraper/robots.py`)".
"""

from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

import httpx


class RobotsFetchError(Exception):
    """Raised when robots.txt cannot be fetched from the target site."""


@dataclass
class RobotsPolicy:
    rules: RobotFileParser
    crawl_delay: Optional[float]


async def fetch_robots_policy(
    base_url: str, user_agent: str, http_client: httpx.AsyncClient
) -> RobotsPolicy:
    """Fetch and parse robots.txt. Raises RobotsFetchError if unreachable."""
    robots_url = urljoin(base_url, "/robots.txt")

    try:
        response = await http_client.get(robots_url)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RobotsFetchError(
            f"Failed to fetch robots.txt from {robots_url}: {exc}"
        ) from exc

    rules = RobotFileParser()
    rules.set_url(robots_url)
    rules.parse(response.text.splitlines())

    crawl_delay = rules.crawl_delay(user_agent)

    return RobotsPolicy(rules=rules, crawl_delay=crawl_delay)


def is_allowed(policy: RobotsPolicy, url: str, user_agent: str) -> bool:
    """True if the robots policy permits user_agent to fetch url."""
    return policy.rules.can_fetch(user_agent, url)


def effective_delay(policy: RobotsPolicy, minimum_delay_seconds: float) -> float:
    """max(policy.crawl_delay or 0, minimum_delay_seconds)."""
    return max(policy.crawl_delay or 0, minimum_delay_seconds)
