from datetime import datetime, timedelta, timezone

import pytest

from app.services.order_service import (
    CustomerNotFoundError,
    OrderNotFoundError,
    find_customer,
    get_order_snapshot,
)

NOW = datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


def test_order_snapshot_flags_delay(fake_supabase):
    fake_supabase.seed("orders", [{
        "id": "IN48213", "customer_id": "C-1", "status": "in_transit",
        "order_value": 1299, "placed_at": _iso(NOW - timedelta(days=6)),
        "eta": _iso(NOW - timedelta(days=3)), "delivered_at": None, "carrier": "Delhivery",
    }])
    fake_supabase.seed("order_items", [])
    fake_supabase.seed("shipment_events", [])

    snapshot = get_order_snapshot("IN48213")
    assert snapshot["is_delayed"] is True
    assert snapshot["delay_hours"] > 0


def test_order_not_delayed_when_delivered(fake_supabase):
    fake_supabase.seed("orders", [{
        "id": "IN1", "customer_id": "C-1", "status": "delivered",
        "order_value": 500, "placed_at": _iso(NOW - timedelta(days=5)),
        "eta": _iso(NOW - timedelta(days=3)), "delivered_at": _iso(NOW - timedelta(days=2)),
        "carrier": "Ekart",
    }])
    fake_supabase.seed("order_items", [])
    fake_supabase.seed("shipment_events", [])

    snapshot = get_order_snapshot("IN1")
    assert snapshot["is_delayed"] is False


def test_order_not_found_raises(fake_supabase):
    with pytest.raises(OrderNotFoundError):
        get_order_snapshot("DOES-NOT-EXIST")


def test_customer_not_found_raises(fake_supabase):
    with pytest.raises(CustomerNotFoundError):
        find_customer(customer_id="NOPE")


def test_find_customer_by_id(fake_supabase):
    fake_supabase.seed("customers", [{"id": "C-1", "full_name": "Test User"}])
    customer = find_customer(customer_id="C-1")
    assert customer["full_name"] == "Test User"
