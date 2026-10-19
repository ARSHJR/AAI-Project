from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.security import CurrentStaff, get_current_staff, require_role
from app.db.supabase_client import get_service_client
from app.schemas.tickets import IncomingMessage
from app.services.ticket_service import ingest_message, resolve_ticket

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.post("")
def create_and_resolve_ticket(
    message: IncomingMessage, staff: CurrentStaff = Depends(get_current_staff)
):
    """Simulates a channel webhook delivering a message, then runs it through
    the full agentic resolution pipeline synchronously (demo-friendly)."""
    ticket = ingest_message(
        channel=message.channel,
        thread_id=message.thread_id,
        raw_message=message.text,
        customer_id_hint=message.customer_id,
        order_id_hint=message.order_id,
    )
    if ticket.get("duplicate"):
        return {**ticket, "note": "Duplicate message within dedup window - not reprocessed"}

    result = resolve_ticket(ticket)
    return result


@router.get("")
def list_tickets(
    status_filter: str | None = Query(default=None, alias="status"),
    channel: str | None = None,
    limit: int = 50,
    staff: CurrentStaff = Depends(get_current_staff),
):
    client = get_service_client()
    query = client.table("tickets").select("*").order("created_at", desc=True).limit(limit)
    if status_filter:
        query = query.eq("status", status_filter)
    if channel:
        query = query.eq("channel", channel)
    resp = query.execute()
    return resp.data or []


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, staff: CurrentStaff = Depends(get_current_staff)):
    client = get_service_client()
    ticket_resp = client.table("tickets").select("*").eq("id", ticket_id).maybe_single().execute()
    if not ticket_resp or not ticket_resp.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    events_resp = (
        client.table("ticket_events").select("*").eq("ticket_id", ticket_id).order("created_at").execute()
    )
    actions_resp = client.table("actions").select("*").eq("ticket_id", ticket_id).execute()
    escalation_resp = (
        client.table("escalations").select("*").eq("ticket_id", ticket_id).maybe_single().execute()
    )

    return {
        **ticket_resp.data,
        "events": events_resp.data or [],
        "actions": actions_resp.data or [],
        "escalation": escalation_resp.data if escalation_resp else None,
    }


@router.post("/{ticket_id}/retry")
def retry_ticket(ticket_id: str, staff: CurrentStaff = Depends(require_role("supervisor"))):
    client = get_service_client()
    ticket_resp = client.table("tickets").select("*").eq("id", ticket_id).maybe_single().execute()
    if not ticket_resp or not ticket_resp.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return resolve_ticket(ticket_resp.data)
