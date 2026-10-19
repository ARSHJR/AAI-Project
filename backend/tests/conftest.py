"""Shared test fixtures: an in-memory fake Supabase client covering the
subset of the query-builder API this project actually uses, so unit tests
never hit a real network/database."""
import copy
import uuid
from datetime import datetime, timezone

import pytest


class _FakeResponse:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _FakeQuery:
    def __init__(self, table: "_FakeTable", op: str, payload=None):
        self.table = table
        self.op = op
        self.payload = payload
        self.filters: list[tuple[str, str, object]] = []
        self._order = None
        self._desc = False
        self._limit = None
        self._single = False
        self._count = None
        self._on_conflict = None

    def eq(self, field, value):
        self.filters.append(("eq", field, value))
        return self

    def neq(self, field, value):
        self.filters.append(("neq", field, value))
        return self

    def gte(self, field, value):
        self.filters.append(("gte", field, value))
        return self

    def order(self, field, desc=False):
        self._order = field
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def maybe_single(self):
        self._single = True
        return self

    def select(self, *_args, count=None, **_kwargs):
        self._count = count
        return self

    def _match(self, row):
        for kind, field, value in self.filters:
            if kind == "eq" and row.get(field) != value:
                return False
            if kind == "neq" and row.get(field) == value:
                return False
            if kind == "gte" and str(row.get(field, "")) < str(value):
                return False
        return True

    def execute(self):
        store = self.table.store
        if self.op == "select":
            rows = [copy.deepcopy(r) for r in store if self._match(r)]
            if self._order:
                rows.sort(key=lambda r: r.get(self._order) or "", reverse=self._desc)
            if self._limit is not None:
                rows = rows[: self._limit]
            if self._single:
                return _FakeResponse(rows[0] if rows else None)
            count = len(rows) if self._count == "exact" else None
            return _FakeResponse(rows, count=count)

        if self.op == "insert":
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for row in rows:
                row = dict(row)
                row.setdefault("id", str(uuid.uuid4()))
                row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                idem = row.get("idempotency_key")
                if idem and any(r.get("idempotency_key") == idem for r in store):
                    raise Exception("duplicate key value violates unique constraint")
                store.append(row)
                inserted.append(copy.deepcopy(row))
            return _FakeResponse(inserted)

        if self.op == "update":
            updated = []
            for row in store:
                if self._match(row):
                    row.update(self.payload)
                    updated.append(copy.deepcopy(row))
            return _FakeResponse(updated)

        if self.op == "upsert":
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            key = self._on_conflict or "id"
            for row in rows:
                existing = next((r for r in store if r.get(key) == row.get(key)), None)
                if existing:
                    existing.update(row)
                else:
                    row = dict(row)
                    row.setdefault("id", str(uuid.uuid4()))
                    store.append(row)
            return _FakeResponse(rows)

        if self.op == "delete":
            remaining = [r for r in store if not self._match(r)]
            store[:] = remaining
            return _FakeResponse([])

        raise NotImplementedError(self.op)


class _FakeTable:
    def __init__(self, store):
        self.store = store

    def select(self, *args, **kwargs):
        return _FakeQuery(self, "select").select(*args, **kwargs)

    def insert(self, payload):
        return _FakeQuery(self, "insert", payload)

    def update(self, payload):
        return _FakeQuery(self, "update", payload)

    def upsert(self, payload, on_conflict=None):
        q = _FakeQuery(self, "upsert", payload)
        q._on_conflict = on_conflict
        return q

    def delete(self):
        return _FakeQuery(self, "delete")


class FakeSupabaseClient:
    def __init__(self):
        self._tables: dict[str, list[dict]] = {}

    def table(self, name: str) -> _FakeTable:
        self._tables.setdefault(name, [])
        return _FakeTable(self._tables[name])

    def seed(self, name: str, rows: list[dict]) -> None:
        self._tables.setdefault(name, [])
        self._tables[name].extend(copy.deepcopy(rows))


_MODULES_USING_CLIENT = [
    "app.db.supabase_client",
    "app.services.order_service",
    "app.services.policy_service",
    "app.services.action_service",
    "app.services.contact_service",
    "app.services.ticket_service",
    "app.api.tickets",
    "app.api.dashboard",
    "app.api.policies",
]


@pytest.fixture
def fake_supabase(monkeypatch):
    """Patches get_service_client everywhere it has already been imported
    as a bare name (modules do `from ... import get_service_client`), plus
    the original definition, so every service sees the same fake backend."""
    import importlib

    client = FakeSupabaseClient()
    for module_path in _MODULES_USING_CLIENT:
        module = importlib.import_module(module_path)
        if hasattr(module, "get_service_client"):
            monkeypatch.setattr(module, "get_service_client", lambda: client)
    return client
