"""Order/shipment data retrieval.

Simulates the "order API" a real support copilot would call. Backed by
Supabase tables seeded with realistic data rather than hard-coded facts in
prompts, so the agent genuinely retrieves state every time.
"""
from datetime import datetime, timezone

from app.db.supabase_client import get_service_client


class OrderNotFoundError(Exception):
    pass


class CustomerNotFoundError(Exception):
    pass


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def find_customer(customer_id: str | None = None, phone: str | None = None) -> dict:
    client = get_service_client()
    query = client.table("customers").select("*")
    if customer_id:
        query = query.eq("id", customer_id)
    elif phone:
        query = query.eq("phone", phone)
    else:
        raise ValueError("customer_id or phone required")
    resp = query.maybe_single().execute()
    if not resp or not resp.data:
        raise CustomerNotFoundError(customer_id or phone or "unknown")
    return resp.data


def get_order_snapshot(order_id: str) -> dict:
    """Pulls order, items, and shipment events, normalizing timestamps/ETA."""
    client = get_service_client()

    order_resp = client.table("orders").select("*").eq("id", order_id).maybe_single().execute()
    if not order_resp or not order_resp.data:
        raise OrderNotFoundError(order_id)
    order = order_resp.data

    items_resp = client.table("order_items").select("*").eq("order_id", order_id).execute()
    events_resp = (
        client.table("shipment_events")
        .select("*")
        .eq("order_id", order_id)
        .order("occurred_at", desc=True)
        .execute()
    )

    eta = _parse_ts(order["eta"])
    delivered_at = _parse_ts(order.get("delivered_at"))
    now = datetime.now(timezone.utc)

    is_delayed = order["status"] not in ("delivered", "cancelled", "returned") and eta is not None and now > eta
    delay_hours = round((now - eta).total_seconds() / 3600, 1) if is_delayed else 0.0

    latest_event = events_resp.data[0] if events_resp.data else None

    return {
        "order_id": order["id"],
        "customer_id": order["customer_id"],
        "status": order["status"],
        "order_value": float(order["order_value"]),
        "placed_at": order["placed_at"],
        "eta": order["eta"],
        "delivered_at": order.get("delivered_at"),
        "carrier": order.get("carrier"),
        "is_delayed": is_delayed,
        "delay_hours": delay_hours,
        "items": items_resp.data or [],
        "shipment_events": events_resp.data or [],
        "latest_event": latest_event,
    }


def find_orders_for_customer(customer_id: str) -> list[dict]:
    client = get_service_client()
    resp = (
        client.table("orders")
        .select("id, status, order_value, eta, placed_at")
        .eq("customer_id", customer_id)
        .order("placed_at", desc=True)
        .execute()
    )
    return resp.data or []
