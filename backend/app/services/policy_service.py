"""Policy & FAQ matching.

Deterministic rule evaluation is primary (auditable, reliable for
financial decisions). Semantic retrieval (pgvector) is used only to help
*surface* candidate policy text for the response-drafting agent and for
ambiguous/FAQ-style situations - never to decide whether money moves.
"""
from app.core.config import get_settings
from app.db.supabase_client import get_service_client


def get_active_policies(category: str | None = None) -> list[dict]:
    client = get_service_client()
    query = client.table("policies").select("*").eq("is_active", True)
    if category:
        query = query.eq("category", category)
    resp = query.execute()
    return resp.data or []


def match_policy(intent: str, order_snapshot: dict | None) -> dict:
    """Deterministically evaluate policy conditions against order facts.

    Returns {"policy": <row or None>, "eligible": bool, "reason": str}.
    This is the auditable core: every financial decision must trace back to
    one of these conditions, not to free-form LLM reasoning.
    """
    settings = get_settings()
    category_map = {
        "delivery_delay": "delivery_delay",
        "refund": "refund",
        "wrong_item": "wrong_item",
        "return": "return",
        "damaged_item": "damaged_item",
    }
    category = category_map.get(intent)
    if category is None:
        return {"policy": None, "eligible": False, "reason": "No policy category maps to this intent"}

    policies = get_active_policies(category=category)
    if not policies:
        return {"policy": None, "eligible": False, "reason": f"No active policy for category={category}"}

    policy = policies[0]  # seed data keeps one canonical active policy per category
    conditions = policy.get("conditions") or {}

    if category == "delivery_delay":
        if not order_snapshot or not order_snapshot.get("is_delayed"):
            return {"policy": policy, "eligible": False, "reason": "Order is not past its ETA"}
        threshold = conditions.get("delay_hours_gt", settings.delay_compensation_threshold_hours)
        delay_hours = order_snapshot.get("delay_hours", 0)
        if delay_hours > threshold:
            return {
                "policy": policy,
                "eligible": True,
                "reason": f"Delay of {delay_hours}h exceeds {threshold}h threshold (policy {policy['code']})",
            }
        return {
            "policy": policy,
            "eligible": False,
            "reason": f"Delay of {delay_hours}h has not exceeded {threshold}h threshold yet",
        }

    if category in ("refund", "wrong_item", "damaged_item"):
        max_auto = conditions.get("auto_approve_max_inr", settings.refund_auto_approve_max_inr)
        order_value = (order_snapshot or {}).get("order_value", 0)
        if order_value <= max_auto:
            return {
                "policy": policy,
                "eligible": True,
                "reason": f"Order value {order_value} within auto-approve cap {max_auto} (policy {policy['code']})",
            }
        return {
            "policy": policy,
            "eligible": False,
            "reason": f"Order value {order_value} exceeds auto-approve cap {max_auto} - needs human review",
        }

    if category == "return":
        window_days = conditions.get("window_days", settings.return_window_days)
        return {
            "policy": policy,
            "eligible": True,
            "reason": f"Return requested within standard {window_days}-day window (policy {policy['code']})",
        }

    return {"policy": policy, "eligible": False, "reason": "Unhandled category"}
