from collections import Counter

from fastapi import APIRouter, Depends

from app.core.security import CurrentStaff, get_current_staff
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metrics")
def get_metrics(staff: CurrentStaff = Depends(get_current_staff)):
    client = get_service_client()
    tickets = client.table("tickets").select(
        "status, channel, detected_language, intent, action_taken, resolution_time_ms"
    ).execute().data or []

    total = len(tickets)
    auto_resolved = sum(1 for t in tickets if t["status"] == "auto_resolved")
    escalated = sum(1 for t in tickets if t["status"] == "escalated")
    failed = sum(1 for t in tickets if t["status"] == "failed")
    resolution_times = [t["resolution_time_ms"] for t in tickets if t.get("resolution_time_ms")]

    return {
        "total_tickets": total,
        "auto_resolved": auto_resolved,
        "escalated": escalated,
        "failed": failed,
        "auto_resolution_rate": round(auto_resolved / total, 3) if total else 0,
        "avg_resolution_time_ms": round(sum(resolution_times) / len(resolution_times)) if resolution_times else 0,
        "language_distribution": dict(Counter(t["detected_language"] for t in tickets if t.get("detected_language"))),
        "intent_distribution": dict(Counter(t["intent"] for t in tickets if t.get("intent"))),
        "channel_distribution": dict(Counter(t["channel"] for t in tickets if t.get("channel"))),
        "action_distribution": dict(Counter(t["action_taken"] for t in tickets if t.get("action_taken"))),
    }


@router.get("/escalations")
def list_escalations(status_filter: str | None = None, staff: CurrentStaff = Depends(get_current_staff)):
    client = get_service_client()
    query = client.table("escalations").select("*, tickets(raw_message, channel, customer_id)").order(
        "created_at", desc=True
    )
    if status_filter:
        query = query.eq("status", status_filter)
    resp = query.execute()
    return resp.data or []


@router.get("/audit")
def list_audit_log(ticket_id: str | None = None, limit: int = 100, staff: CurrentStaff = Depends(get_current_staff)):
    client = get_service_client()
    query = client.table("audit_log").select("*").order("created_at", desc=True).limit(limit)
    if ticket_id:
        query = query.eq("ticket_id", ticket_id)
    resp = query.execute()
    return resp.data or []
