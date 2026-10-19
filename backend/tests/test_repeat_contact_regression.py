"""Regression test: a "reply_only" resolution must NOT clear repeat-contact
history. Previously resolve_ticket marked a customer's contact as resolved
whenever the ticket status was "auto_resolved", conflating "the ticket
closed without escalation" with "the customer's underlying problem was
actually fixed". A plain informational reply (order tracking: "it's still
in transit") changes nothing about the order, so a customer who messages
again about the same stuck order should still trip the repeat-contact
escalation threshold - caught via live end-to-end testing where three
consecutive "still waiting" messages never escalated.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import get_settings
from app.services import contact_service
from app.services.ticket_service import ingest_message, resolve_ticket


@pytest.fixture(autouse=True)
def mock_llm(monkeypatch):
    """Returns a high-confidence order_tracking classification (and a stub
    reply) so these tests reach the reply_only decision path deterministically,
    without depending on network/LLM credentials."""

    def _fake_llm(_system_prompt, _user_prompt):
        return {
            "intent": "order_tracking",
            "confidence": 0.95,
            "multi_intent": [],
            "reply": "Your order is still in transit.",
        }

    monkeypatch.setattr("app.agents.nodes.call_structured_llm", _fake_llm)


def test_reply_only_resolution_leaves_contact_unresolved(fake_supabase):
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

    assert result["decision"] == "reply_only"
    assert result["status"] == "auto_resolved"
    assert contact_service.unresolved_contact_count("C-1", "IN1") == 1


def test_three_reply_only_contacts_trigger_escalation(fake_supabase):
    now = datetime.now(timezone.utc)
    fake_supabase.seed("customers", [{"id": "C-1", "full_name": "Test User"}])
    fake_supabase.seed("orders", [{
        "id": "IN1", "customer_id": "C-1", "status": "in_transit",
        "order_value": 500, "placed_at": (now - timedelta(days=2)).isoformat(),
        "eta": (now + timedelta(days=2)).isoformat(), "delivered_at": None, "carrier": "Ekart",
    }])
    fake_supabase.seed("order_items", [])
    fake_supabase.seed("shipment_events", [])

    threshold = get_settings().repeat_contact_escalation_threshold
    results = []
    for i in range(threshold):
        ticket = ingest_message("chat", f"T-{i}", "Still waiting on my order", customer_id_hint="C-1", order_id_hint="IN1")
        results.append(resolve_ticket(ticket))

    assert results[-1]["status"] == "escalated"
    assert results[-1]["decision_reasoning"]["cause"] == "repeat_unresolved_contact"
