"""Orchestrator persistence layer: ingestion, dedup, graph invocation, and
writing the full decision trail (ticket_events, actions, escalations,
audit_log, contact_history) back to Supabase.
"""
import logging
import time
from datetime import datetime, timedelta, timezone

from app.agents.graph import get_graph
from app.db.supabase_client import get_service_client
from app.services import contact_service

logger = logging.getLogger(__name__)

DEDUP_WINDOW_SECONDS = 30


def _is_duplicate_message(channel: str, thread_id: str, raw_message: str) -> bool:
    client = get_service_client()
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=DEDUP_WINDOW_SECONDS)).isoformat()
    resp = (
        client.table("tickets")
        .select("id")
        .eq("channel", channel)
        .eq("thread_id", thread_id)
        .eq("raw_message", raw_message)
        .gte("created_at", cutoff)
        .execute()
    )
    return bool(resp.data)


def ingest_message(
    channel: str,
    thread_id: str,
    raw_message: str,
    customer_id_hint: str | None = None,
    order_id_hint: str | None = None,
) -> dict:
    """Creates a ticket row (unified schema) for a normalized channel payload.

    Returns the created ticket, or the existing one if this is a duplicate
    delivery of the same message within the dedup window.
    """
    client = get_service_client()

    if _is_duplicate_message(channel, thread_id, raw_message):
        existing = (
            client.table("tickets")
            .select("*")
            .eq("channel", channel)
            .eq("thread_id", thread_id)
            .eq("raw_message", raw_message)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return {**existing.data[0], "duplicate": True}

    row = {
        "channel": channel,
        "thread_id": thread_id,
        "customer_id": customer_id_hint,
        "order_id": order_id_hint,
        "raw_message": raw_message,
        "status": "received",
    }
    resp = client.table("tickets").insert(row).execute()
    return {**resp.data[0], "duplicate": False}


def _persist_events(ticket_id: str, events: list[dict]) -> None:
    client = get_service_client()
    if not events:
        return
    rows = [{"ticket_id": ticket_id, **event} for event in events]
    client.table("ticket_events").insert(rows).execute()
    client.table("audit_log").insert(
        [
            {
                "ticket_id": ticket_id,
                "actor": "orchestrator",
                "event_type": event["step"],
                "details": event["payload"],
            }
            for event in events
        ]
    ).execute()


def _persist_escalation(ticket_id: str, state: dict) -> None:
    if state.get("status") != "escalated":
        return
    client = get_service_client()
    client.table("escalations").insert(
        {
            "ticket_id": ticket_id,
            "reason": state.get("escalation_reason", "unspecified"),
            "urgency": state.get("escalation_urgency", "medium"),
            "summary": state.get("escalation_summary", {}),
        }
    ).execute()


def resolve_ticket(ticket: dict) -> dict:
    """Runs the full LangGraph workflow for a ticket and persists the result."""
    client = get_service_client()
    ticket_id = ticket["id"]
    started = time.monotonic()

    client.table("tickets").update({"status": "processing"}).eq("id", ticket_id).execute()

    graph = get_graph()
    initial_state = {
        "ticket_id": ticket_id,
        "channel": ticket["channel"],
        "thread_id": ticket["thread_id"],
        "customer_id_hint": ticket.get("customer_id"),
        "order_id_hint": ticket.get("order_id"),
        "raw_message": ticket["raw_message"],
        "events": [],
        "status": "processing",
        "order_lookup_retries": 0,
    }

    try:
        final_state = graph.invoke(initial_state)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Graph execution failed for ticket %s", ticket_id)
        client.table("tickets").update(
            {"status": "failed", "final_response": "We hit a technical issue processing this request."}
        ).eq("id", ticket_id).execute()
        client.table("audit_log").insert(
            {"ticket_id": ticket_id, "actor": "orchestrator", "event_type": "fatal_error", "details": {"error": str(exc)}}
        ).execute()
        raise

    resolution_ms = int((time.monotonic() - started) * 1000)
    final_status = final_state.get("status") or ("escalated" if final_state["decision"] == "escalation" else "auto_resolved")
    if final_status == "processing":
        final_status = "auto_resolved"

    client.table("tickets").update(
        {
            "customer_id": (final_state.get("customer") or {}).get("id") or ticket.get("customer_id"),
            "order_id": (final_state.get("order") or {}).get("order_id") or ticket.get("order_id"),
            "detected_language": final_state.get("detected_language"),
            "script": final_state.get("script"),
            "normalized_text": final_state.get("normalized_text"),
            "intent": final_state.get("intent"),
            "intent_confidence": final_state.get("intent_confidence"),
            "multi_intent": final_state.get("multi_intent", []),
            "status": final_status,
            "action_taken": final_state.get("decision"),
            "escalation_reason": final_state.get("escalation_reason"),
            "urgency": final_state.get("escalation_urgency"),
            "final_response": final_state.get("final_response"),
            "resolution_time_ms": resolution_ms,
        }
    ).eq("id", ticket_id).execute()

    _persist_events(ticket_id, final_state.get("events", []))
    _persist_escalation(ticket_id, final_state)

    customer = final_state.get("customer")
    if customer:
        order_id = (final_state.get("order") or {}).get("order_id")
        contact_service.record_contact(customer["id"], order_id, ticket_id)
        if final_status == "auto_resolved":
            contact_service.mark_resolved(ticket_id)

    return {**ticket, **final_state, "status": final_status, "resolution_time_ms": resolution_ms}
