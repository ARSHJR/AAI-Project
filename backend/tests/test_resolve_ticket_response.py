"""Regression test: resolve_ticket's returned dict must expose action_taken
consistent with what's persisted to the tickets table. Previously the
returned dict only merged `final_state` (which has a "decision" key, not
"action_taken") on top of the original ticket row, so the synchronous
POST /tickets response silently omitted action_taken even though the DB
row was updated correctly - a real API contract bug caught via live
end-to-end testing against Supabase + Groq.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.llm_service import LLMError
from app.services.ticket_service import ingest_message, resolve_ticket


@pytest.fixture(autouse=True)
def mock_llm(monkeypatch):
    def _raise(*_args, **_kwargs):
        raise LLMError("mocked: no LLM in unit tests")

    monkeypatch.setattr("app.agents.nodes.call_structured_llm", _raise)


def test_returned_action_taken_matches_persisted_row(fake_supabase):
    now = datetime.now(timezone.utc)
    fake_supabase.seed("customers", [{"id": "C-1", "full_name": "Test User"}])
    fake_supabase.seed("orders", [{
        "id": "IN1", "customer_id": "C-1", "status": "in_transit",
        "order_value": 500, "placed_at": (now - timedelta(days=2)).isoformat(),
        "eta": (now + timedelta(days=2)).isoformat(), "delivered_at": None, "carrier": "Ekart",
    }])
    fake_supabase.seed("order_items", [])
    fake_supabase.seed("shipment_events", [])

    ticket = ingest_message("chat", "T-1", "Where is my order?", customer_id_hint="C-1", order_id_hint="IN1")
    result = resolve_ticket(ticket)

    persisted = next(t for t in fake_supabase._tables["tickets"] if t["id"] == ticket["id"])

    assert result["action_taken"] == persisted["action_taken"]
    assert result["action_taken"] == result["decision"]
