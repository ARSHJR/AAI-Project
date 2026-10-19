"""Seeds Supabase with realistic demo data covering all 9 demo scenarios.

Run with: python -m seed.seed_data
Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env.
"""
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")

from app.db.supabase_client import get_service_client  # noqa: E402

now = datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


CUSTOMERS = [
    {"id": "C-7719", "full_name": "Priya Sharma", "phone": "+919820011223", "email": "priya.sharma@example.com", "preferred_language": "hi"},
    {"id": "C-5502", "full_name": "Rahul Verma", "phone": "+919820033445", "email": "rahul.verma@example.com", "preferred_language": "en"},
    {"id": "C-3381", "full_name": "Sneha Kulkarni", "phone": "+919820055667", "email": "sneha.kulkarni@example.com", "preferred_language": "mr"},
    {"id": "C-9120", "full_name": "Amit Joshi", "phone": "+919820077889", "email": "amit.joshi@example.com", "preferred_language": "en"},
    {"id": "C-4456", "full_name": "Fatima Khan", "phone": "+919820099001", "email": "fatima.khan@example.com", "preferred_language": "hi"},
    {"id": "C-6671", "full_name": "Deepak Nair", "phone": "+919820012121", "email": "deepak.nair@example.com", "preferred_language": "en"},
]

ORDERS = [
    # 1. Hindi/Hinglish delayed delivery -> auto compensation
    {"id": "IN48213", "customer_id": "C-7719", "status": "in_transit", "order_value": 1299.00,
     "placed_at": now - timedelta(days=6), "eta": now - timedelta(days=3), "carrier": "Delhivery"},
    # 2. English order tracking (on time, in transit)
    {"id": "IN51092", "customer_id": "C-5502", "status": "in_transit", "order_value": 2499.00,
     "placed_at": now - timedelta(days=1), "eta": now + timedelta(days=2), "carrier": "BlueDart"},
    # 3. Wrong item + refund (delivered, low value -> auto refund eligible)
    {"id": "IN33087", "customer_id": "C-3381", "status": "delivered", "order_value": 899.00,
     "placed_at": now - timedelta(days=10), "eta": now - timedelta(days=7),
     "delivered_at": now - timedelta(days=6), "carrier": "Ekart"},
    # 4. Marathi return request (delivered, within return window)
    {"id": "IN22456", "customer_id": "C-3381", "status": "delivered", "order_value": 1599.00,
     "placed_at": now - timedelta(days=5), "eta": now - timedelta(days=3),
     "delivered_at": now - timedelta(days=2), "carrier": "Delhivery"},
    # 5. High-value refund -> escalation
    {"id": "IN77001", "customer_id": "C-9120", "status": "delivered", "order_value": 18400.00,
     "placed_at": now - timedelta(days=4), "eta": now - timedelta(days=2),
     "delivered_at": now - timedelta(days=1), "carrier": "BlueDart"},
    # 6. Order referenced for "not found" scenario - deliberately NOT seeded (IN00000)
    # 7. Ambiguous/unsupported policy situation (cancelled order, asking for delay comp)
    {"id": "IN60099", "customer_id": "C-4456", "status": "cancelled", "order_value": 749.00,
     "placed_at": now - timedelta(days=8), "eta": now - timedelta(days=5), "carrier": "Ekart"},
    # 8. Repeat contact about unresolved order (still in_transit, multiple contacts)
    {"id": "IN68211", "customer_id": "C-6671", "status": "in_transit", "order_value": 1099.00,
     "placed_at": now - timedelta(days=7), "eta": now - timedelta(days=4), "carrier": "Delhivery"},
    # 9. Backend/API failure demo uses IN48213 again via a special test order id
    {"id": "IN90555", "customer_id": "C-6671", "status": "processing", "order_value": 599.00,
     "placed_at": now - timedelta(hours=5), "eta": now + timedelta(days=4), "carrier": "Ekart"},
]

ORDER_ITEMS = [
    {"order_id": "IN48213", "sku": "SKU-1001", "name": "Wireless Earbuds Pro", "quantity": 1, "price": 1299.00, "category": "electronics"},
    {"order_id": "IN51092", "sku": "SKU-2002", "name": "Running Shoes M9", "quantity": 1, "price": 2499.00, "category": "footwear"},
    {"order_id": "IN33087", "sku": "SKU-3003", "name": "Ceramic Coffee Mug Set", "quantity": 1, "price": 899.00, "category": "home"},
    {"order_id": "IN22456", "sku": "SKU-4004", "name": "Cotton Kurta (L)", "quantity": 1, "price": 1599.00, "category": "apparel"},
    {"order_id": "IN77001", "sku": "SKU-5005", "name": "4K Smart TV 43-inch", "quantity": 1, "price": 18400.00, "category": "electronics"},
    {"order_id": "IN60099", "sku": "SKU-6006", "name": "Yoga Mat", "quantity": 1, "price": 749.00, "category": "fitness"},
    {"order_id": "IN68211", "sku": "SKU-7007", "name": "Bluetooth Speaker", "quantity": 1, "price": 1099.00, "category": "electronics"},
    {"order_id": "IN90555", "sku": "SKU-8008", "name": "Phone Case", "quantity": 2, "price": 299.50, "category": "accessories"},
]

SHIPMENT_EVENTS = [
    {"order_id": "IN48213", "event_type": "picked_up", "description": "Package picked up", "location": "Mumbai Hub", "occurred_at": now - timedelta(days=6)},
    {"order_id": "IN48213", "event_type": "in_transit", "description": "In transit to destination hub", "location": "Pune Hub", "occurred_at": now - timedelta(days=4)},
    {"order_id": "IN48213", "event_type": "hub_delay", "description": "Delayed at sorting hub due to high volume", "location": "Pune Hub", "occurred_at": now - timedelta(days=1)},

    {"order_id": "IN51092", "event_type": "picked_up", "description": "Package picked up", "location": "Bengaluru Hub", "occurred_at": now - timedelta(days=1)},
    {"order_id": "IN51092", "event_type": "in_transit", "description": "In transit", "location": "Bengaluru Hub", "occurred_at": now - timedelta(hours=12)},

    {"order_id": "IN33087", "event_type": "delivered", "description": "Delivered - signed by recipient", "location": "Pune", "occurred_at": now - timedelta(days=6)},
    {"order_id": "IN22456", "event_type": "delivered", "description": "Delivered - left at door", "location": "Pune", "occurred_at": now - timedelta(days=2)},
    {"order_id": "IN77001", "event_type": "delivered", "description": "Delivered - signed by recipient", "location": "Nagpur", "occurred_at": now - timedelta(days=1)},

    {"order_id": "IN60099", "event_type": "cancelled", "description": "Order cancelled by customer before dispatch", "location": "-", "occurred_at": now - timedelta(days=8)},

    {"order_id": "IN68211", "event_type": "picked_up", "description": "Package picked up", "location": "Mumbai Hub", "occurred_at": now - timedelta(days=7)},
    {"order_id": "IN68211", "event_type": "exception", "description": "Address verification exception", "location": "Thane Hub", "occurred_at": now - timedelta(days=4)},

    {"order_id": "IN90555", "event_type": "order_confirmed", "description": "Order confirmed, preparing for dispatch", "location": "Warehouse", "occurred_at": now - timedelta(hours=5)},
]

PAYMENTS = [
    {"order_id": o["id"], "method": "UPI", "amount": o["order_value"], "status": "paid"} for o in ORDERS
]

POLICIES = [
    {"code": "6.1", "title": "Delivery Delay Compensation", "category": "delivery_delay",
     "body": "If a shipment is not delivered within 48 hours of its stated ETA, the customer is eligible for a flat delay compensation credit, applied automatically to their account. The customer is informed of the revised estimate.",
     "conditions": {"delay_hours_gt": 48}},
    {"code": "4.2", "title": "Standard Refund Eligibility", "category": "refund",
     "body": "Refund requests for orders valued up to the auto-approval cap (see config) may be approved automatically once wrong-item, damage, or non-delivery is confirmed. Orders above the cap require supervisor review due to financial risk.",
     "conditions": {"auto_approve_max_inr": 3000}},
    {"code": "4.3", "title": "Wrong Item Received", "category": "wrong_item",
     "body": "If a customer reports receiving an incorrect item, a refund or replacement may be auto-approved for orders within the standard auto-approval cap. Photo evidence is requested for high-value items.",
     "conditions": {"auto_approve_max_inr": 3000}},
    {"code": "5.1", "title": "Return Window", "category": "return",
     "body": "Customers may initiate a return within the standard return window of the delivery date for eligible categories. A return label is generated automatically once the request is validated against the order's delivered_at date.",
     "conditions": {"window_days": 10}},
    {"code": "4.4", "title": "Damaged Item on Arrival", "category": "damaged_item",
     "body": "Items reported damaged on arrival are eligible for refund or replacement within the standard auto-approval cap, pending photo evidence for high-value claims.",
     "conditions": {"auto_approve_max_inr": 3000}},
    {"code": "7.1", "title": "High-Value Transaction Review", "category": "high_value",
     "body": "Any refund, return, or compensation action on an order above the auto-approval cap must be escalated to a human supervisor with full context before any funds move.",
     "conditions": {"threshold_inr": 3000}},
    {"code": "8.1", "title": "Escalation Conditions", "category": "escalation",
     "body": "Tickets are escalated to a human agent when: intent confidence is below threshold, multiple conflicting intents are detected, the order/customer cannot be identified, the same unresolved issue has been raised 3+ times, or policy conditions do not clearly apply.",
     "conditions": {}},
    {"code": "9.1", "title": "Cancelled Order Claims", "category": "general",
     "body": "Orders that were cancelled before dispatch are not eligible for delivery-delay compensation, since no shipment occurred. Such requests should be reviewed by a human agent to confirm the cancellation circumstances.",
     "conditions": {}},
]

STAFF_NOTE = """
NOTE: staff_profiles rows are NOT seeded here because they must reference a
real Supabase Auth user id. After creating demo users in Supabase Auth
(dashboard -> Authentication -> Users, or via the API), insert their profile
rows manually, e.g.:

insert into staff_profiles (id, full_name, role) values
  ('<auth-user-uuid>', 'Demo Agent', 'agent'),
  ('<auth-user-uuid>', 'Demo Supervisor', 'supervisor');

See README.md "Demo credentials" section for the exact steps.
"""


def _to_rows(items: list[dict]) -> list[dict]:
    rows = []
    for item in items:
        row = dict(item)
        for key, value in row.items():
            if isinstance(value, datetime):
                row[key] = iso(value)
        rows.append(row)
    return rows


def main() -> None:
    client = get_service_client()

    print("Seeding customers...")
    client.table("customers").upsert(CUSTOMERS).execute()

    print("Seeding orders...")
    client.table("orders").upsert(_to_rows(ORDERS)).execute()

    print("Seeding order items...")
    client.table("order_items").delete().neq("order_id", "").execute()
    client.table("order_items").insert(ORDER_ITEMS).execute()

    print("Seeding shipment events...")
    client.table("shipment_events").delete().neq("order_id", "").execute()
    client.table("shipment_events").insert(_to_rows(SHIPMENT_EVENTS)).execute()

    print("Seeding payments...")
    client.table("payments").delete().neq("order_id", "").execute()
    client.table("payments").insert(PAYMENTS).execute()

    print("Seeding policies...")
    client.table("policies").upsert(POLICIES, on_conflict="code").execute()

    print("Done.")
    print(STAFF_NOTE)


if __name__ == "__main__":
    main()
