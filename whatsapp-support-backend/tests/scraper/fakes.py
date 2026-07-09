"""
Shared fake Supabase double + fake `create_document_record` /
`create_version_record` helpers used by the ingestor tests
(`test_ingestor_properties.py`, `test_ingestor_unit.py`).

`ingest_page` (`app/core/scraper/ingestor.py`) issues several chained
Supabase query-builder calls per invocation (`.table(...).select(...)
.eq(...).execute()`, `.insert(...).execute()`, `.update(...).eq(...)
.execute()`) against `scraped_pages` and `knowledge_document_versions`.
`FakeSupabase` implements just enough of that chained builder interface,
backed by a plain in-memory dict of lists, to exercise the real ingestor
code paths without touching a real database.

Not a test file itself (no `test_*`/`*_test` name), so pytest will not try
to collect it.
"""

from typing import Optional
from uuid import uuid4


class FakeResponse:
    """Mimics the `.data` attribute supabase-py responses expose."""

    def __init__(self, data):
        self.data = data


class FakeQueryBuilder:
    """A minimal, chainable stand-in for supabase-py's query builder.

    Only supports the operations `ingest_page` actually issues: `select`,
    `insert`, `update`, `eq`, `order`, `limit`. Rows are plain dicts stored
    in `store[table_name]`, mutated in place by `update`/`insert` so state
    persists across calls against the same `store`.
    """

    def __init__(self, store: dict, table_name: str):
        self.store = store
        self.table_name = table_name
        self.op: Optional[str] = None
        self.payload = None
        self.filters = []
        self.order_field = None
        self.order_desc = False
        self.limit_n = None
        self.range_start = None
        self.range_end = None

    def select(self, _columns="*"):
        self.op = "select"
        return self

    def insert(self, data):
        self.op = "insert"
        self.payload = data
        return self

    def update(self, data):
        self.op = "update"
        self.payload = data
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def order(self, field, desc=False):
        self.order_field = field
        self.order_desc = desc
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def range(self, start, end):
        """Mimics supabase-py's `.range(start, end)` (inclusive of `end`),
        used by `GET /scraper/jobs` pagination."""
        self.range_start = start
        self.range_end = end
        return self

    def _rows(self):
        return self.store.setdefault(self.table_name, [])

    def _matching(self):
        rows = self._rows()
        return [
            row
            for row in rows
            if all(row.get(field) == value for field, value in self.filters)
        ]

    def execute(self):
        if self.op == "insert":
            rows = self._rows()
            payload = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for item in payload:
                row = dict(item)
                row.setdefault("id", str(uuid4()))
                rows.append(row)
                inserted.append(row)
            return FakeResponse(inserted)

        if self.op == "update":
            matched = self._matching()
            for row in matched:
                row.update(self.payload)
            return FakeResponse(matched)

        if self.op == "select":
            matched = self._matching()
            if self.order_field is not None:
                matched = sorted(
                    matched, key=lambda r: r.get(self.order_field), reverse=self.order_desc
                )
            if self.limit_n is not None:
                matched = matched[: self.limit_n]
            if self.range_start is not None:
                matched = matched[self.range_start : self.range_end + 1]
            return FakeResponse(matched)

        return FakeResponse([])


class FakeSupabase:
    """Drop-in replacement for `app.core.scraper.ingestor.supabase`."""

    def __init__(self):
        self.store: dict = {}

    def table(self, name: str) -> FakeQueryBuilder:
        return FakeQueryBuilder(self.store, name)


def make_fake_create_document_record(store: dict):
    """Returns an async function matching
    `app.api.v1.knowledge_base.create_document_record`'s signature, that
    inserts into the same in-memory `store` used by `FakeSupabase` so
    "at most one document per URL" assertions can inspect real state."""

    async def _fake_create_document_record(title, description, uploader_id, source="scraper"):
        row = {
            "id": str(uuid4()),
            "title": title,
            "description": description,
            "uploader_id": str(uploader_id) if uploader_id else None,
            "source": source,
        }
        store.setdefault("knowledge_documents", []).append(row)
        return row

    return _fake_create_document_record


def make_fake_update_document_description(store: dict):
    """Returns an async function matching
    `app.api.v1.knowledge_base.update_document_description`'s signature,
    that mutates the matching row in the same in-memory `store` used by
    `FakeSupabase` (Requirement 6.5)."""

    async def _fake_update_document_description(document_id, description):
        rows = store.setdefault("knowledge_documents", [])
        for row in rows:
            if row["id"] == str(document_id):
                row["description"] = description
                return row
        raise Exception("Failed to update document description")

    return _fake_update_document_description


def make_fake_create_version_record(store: dict):
    """Returns an async function matching
    `app.api.v1.knowledge_base.create_version_record`'s signature, that
    inserts into the same in-memory `store` so created version rows remain
    queryable afterward regardless of any injected indexing failure."""

    async def _fake_create_version_record(
        document_id, version_number, checksum, file_size, file_type, uploader_id
    ):
        row = {
            "id": str(uuid4()),
            "document_id": str(document_id),
            "version_number": version_number,
            "checksum": checksum,
            "file_size": file_size,
            "file_type": file_type,
            "uploader_id": str(uploader_id) if uploader_id else None,
        }
        store.setdefault("knowledge_document_versions", []).append(row)
        return row

    return _fake_create_version_record
