"""Repeat-contact memory: tracks unresolved contacts per customer+order and
escalates automatically once a configured threshold is hit."""
from app.core.config import get_settings
from app.db.supabase_client import get_service_client


def record_contact(customer_id: str, order_id: str | None, ticket_id: str) -> None:
    get_service_client().table("contact_history").insert(
        {"customer_id": customer_id, "order_id": order_id, "ticket_id": ticket_id, "resolved": False}
    ).execute()


def mark_resolved(ticket_id: str) -> None:
    get_service_client().table("contact_history").update({"resolved": True}).eq(
        "ticket_id", ticket_id
    ).execute()


def unresolved_contact_count(customer_id: str, order_id: str | None) -> int:
    client = get_service_client()
    query = client.table("contact_history").select("id", count="exact").eq("customer_id", customer_id).eq(
        "resolved", False
    )
    if order_id:
        query = query.eq("order_id", order_id)
    resp = query.execute()
    return resp.count or 0


def should_escalate_for_repeat_contact(customer_id: str, order_id: str | None) -> bool:
    settings = get_settings()
    count = unresolved_contact_count(customer_id, order_id)
    return count >= settings.repeat_contact_escalation_threshold
