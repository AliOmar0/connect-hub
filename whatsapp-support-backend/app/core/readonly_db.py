"""
Read-only Supabase client for the "Bank_db_oss" project.

The bank project holds live customer account data. Nothing in this backend may
ever write to it, so read-only is enforced twice:

1. **Transport layer** (`_GetOnlyHttpxClient`) - the httpx client handed to
   supabase-py refuses to emit anything but GET/HEAD. supabase-py threads this
   one client through postgrest, storage, functions *and* auth, so there is no
   sub-client that can slip a write past it. This is the guard that actually
   holds; everything else is ergonomics.
2. **API surface** (`ReadOnlyClient`) - a facade with no ``__getattr__``
   passthrough, so ``.postgrest`` / ``.storage`` / ``.auth`` / ``.schema()`` are
   not reachable at all, and ``insert``/``update``/``upsert``/``delete`` raise a
   named error instead of failing later with an opaque HTTP 405.

Both are defence in depth *on top of* the database-side grants in
``scripts/sql/bank_db_oss_readonly.sql``, which is where read-only is really
guaranteed. Application-layer guards cannot bind an attacker who has the key.

Note on RPC: ``postgrest`` builds a POST for stored-procedure calls unless
``get=True`` is passed (postgrest/_sync/client.py: ``method = "HEAD" if head
else "GET" if get else "POST"``). We always pass ``get=True`` so RPC survives
the transport guard - which requires the SQL function to be declared ``STABLE``,
since PostgREST only serves non-volatile functions over GET.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Optional

import httpx
from postgrest import SyncRPCFilterRequestBuilder, SyncSelectRequestBuilder
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

logger = logging.getLogger(__name__)

_ALLOWED_METHODS = frozenset({"GET", "HEAD"})


class ReadOnlyViolation(RuntimeError):
    """Raised when code attempts a write against a read-only client."""


class _GetOnlyHttpxClient(httpx.Client):
    """httpx client that refuses to send anything but GET/HEAD.

    ``send`` is the right override point: both ``request()`` and ``stream()``
    funnel through ``build_request`` + ``send``, so overriding ``request``
    alone would leave ``stream`` unguarded.
    """

    def send(self, request: httpx.Request, **kwargs: Any) -> httpx.Response:
        if request.method not in _ALLOWED_METHODS:
            raise ReadOnlyViolation(
                f"bank_db_oss is read-only: refused {request.method} {request.url.path}"
            )
        return super().send(request, **kwargs)


class _ReadOnlyTable:
    """Table handle exposing reads only."""

    __slots__ = ("_builder", "_name")

    def __init__(self, builder: Any, name: str) -> None:
        self._builder = builder
        self._name = name

    def select(self, *columns: str, count: Any = None, head: bool = False) -> SyncSelectRequestBuilder:
        # Returns the real postgrest builder on purpose: the fluent chain
        # (.eq().limit().execute()) cannot turn a SELECT into a write, so
        # re-wrapping it would add code without adding safety.
        return self._builder.select(*columns, count=count, head=head)

    def _deny(self, op: str) -> "ReadOnlyViolation":
        return ReadOnlyViolation(
            f"{op}() is not permitted on read-only table {self._name!r} (bank_db_oss)"
        )

    def insert(self, *args: Any, **kwargs: Any) -> Any:
        raise self._deny("insert")

    def update(self, *args: Any, **kwargs: Any) -> Any:
        raise self._deny("update")

    def upsert(self, *args: Any, **kwargs: Any) -> Any:
        raise self._deny("upsert")

    def delete(self, *args: Any, **kwargs: Any) -> Any:
        raise self._deny("delete")


class ReadOnlyClient:
    """Facade over a Supabase client that permits reads only.

    ``allowed_tables`` / ``allowed_rpc`` are allowlists: an empty set means
    "nothing of that kind is reachable".
    """

    __slots__ = ("_client", "_allowed_tables", "_allowed_rpc")

    def __init__(
        self,
        client: Client,
        *,
        allowed_tables: Iterable[str] = (),
        allowed_rpc: Iterable[str] = (),
    ) -> None:
        self._client = client
        self._allowed_tables = frozenset(allowed_tables)
        self._allowed_rpc = frozenset(allowed_rpc)

    def table(self, table_name: str) -> _ReadOnlyTable:
        if table_name not in self._allowed_tables:
            raise ReadOnlyViolation(
                f"table {table_name!r} is not on the bank_db_oss read allowlist "
                f"({sorted(self._allowed_tables)})"
            )
        return _ReadOnlyTable(self._client.table(table_name), table_name)

    def from_(self, table_name: str) -> _ReadOnlyTable:
        return self.table(table_name)

    def rpc(self, fn: str, params: Optional[Dict[str, Any]] = None) -> SyncRPCFilterRequestBuilder:
        if fn not in self._allowed_rpc:
            raise ReadOnlyViolation(
                f"rpc {fn!r} is not on the bank_db_oss read allowlist "
                f"({sorted(self._allowed_rpc)})"
            )
        # get=True -> GET, which the transport guard allows and which PostgREST
        # only serves for STABLE/IMMUTABLE functions.
        return self._client.rpc(fn, params or {}, get=True)


def create_readonly_client(
    url: str,
    key: str,
    *,
    allowed_tables: Iterable[str] = (),
    allowed_rpc: Iterable[str] = (),
    timeout: float = 10.0,
) -> ReadOnlyClient:
    """Build a Supabase client that is structurally incapable of writing."""
    options = ClientOptions(
        httpx_client=_GetOnlyHttpxClient(
            follow_redirects=True,
            timeout=httpx.Timeout(timeout),
        ),
        # No background token refresh (it would POST) and nothing persisted to disk.
        auto_refresh_token=False,
        persist_session=False,
    )
    return ReadOnlyClient(
        create_client(url, key, options=options),
        allowed_tables=allowed_tables,
        allowed_rpc=allowed_rpc,
    )
