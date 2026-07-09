"""
Content extraction helpers for the Bank Scraper Vector Knowledge Base feature.

Parses fetched HTML with BeautifulSoup, strips boilerplate (nav/header/
footer/script/style and anything tagged ``role="navigation"``), and exposes
the remaining title/visible text plus absolute-URL link discovery. These are
pure functions operating on plain strings (no I/O), which makes them a
primary target for property-based testing (design.md Correctness Properties
8 and 11).

See design.md -> "5. `ContentExtractor` (`app/core/scraper/extractor.py`)".
"""

import re
from dataclasses import dataclass
from typing import List
from urllib.parse import urljoin

from bs4 import BeautifulSoup

# Tags removed wholesale before extracting visible text, regardless of
# attributes.
_BOILERPLATE_TAGS = ("nav", "header", "footer", "script", "style")


# Maximum length of a Page_Description derived from the start of a page's
# extracted main text when no HTML meta description is present
# (Requirement 3.7).
_DERIVED_DESCRIPTION_MAX_CHARS = 200


@dataclass
class ExtractedPage:
    title: str
    main_text: str
    description: str = ""


def _strip_boilerplate(soup: BeautifulSoup) -> None:
    """Decompose <nav>/<header>/<footer>/<script>/<style> and any element
    with role="navigation", regardless of tag, in place."""
    for tag_name in _BOILERPLATE_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    for tag in soup.find_all(attrs={"role": "navigation"}):
        tag.decompose()


def _extract_meta_description(soup: BeautifulSoup) -> str:
    """Reads `<meta name="description" content="...">` (case-insensitive on
    the `name` attribute), returning "" when absent or empty."""
    meta_tag = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    if meta_tag is None:
        return ""
    content = meta_tag.get("content", "")
    return content.strip() if content else ""


def _derive_description_from_main_text(main_text: str) -> str:
    """Derives a Page_Description from the first
    `_DERIVED_DESCRIPTION_MAX_CHARS` characters of the extracted main text
    (Requirement 3.7), returning "" when `main_text` is empty
    (Requirement 3.8)."""
    if not main_text:
        return ""
    return main_text[:_DERIVED_DESCRIPTION_MAX_CHARS].strip()


def extract_content(html: str) -> ExtractedPage:
    """Parses HTML with BeautifulSoup, drops <nav>, <header>, <footer>,
    <script>, <style>, and elements with role="navigation" before extracting
    the page title and remaining visible text.

    Also extracts a Page_Description (Requirements 3.6, 3.7, 3.8): prefers
    the HTML `<meta name="description">` content when present, otherwise
    falls back to the first 200 characters of the extracted main text, and
    leaves the description empty when main text is empty rather than
    deriving it from other markup (e.g. boilerplate that was stripped).
    """
    soup = BeautifulSoup(html, "html.parser")

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""
    if title_tag is not None:
        # <title> lives in <head> and isn't visible page content; drop it so
        # it doesn't leak into main_text.
        title_tag.decompose()

    meta_description = _extract_meta_description(soup)

    _strip_boilerplate(soup)

    main_text = soup.get_text(separator=" ", strip=True)
    # Collapse repeated whitespace left behind by removed elements.
    main_text = " ".join(main_text.split())

    description = meta_description or _derive_description_from_main_text(main_text)

    return ExtractedPage(title=title, main_text=main_text, description=description)


def discover_links(html: str, base_url: str) -> List[str]:
    """Resolves all <a href> targets to absolute URLs."""
    soup = BeautifulSoup(html, "html.parser")

    links: List[str] = []
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        if not href:
            continue
        links.append(urljoin(base_url, href))

    return links
