from app.services import policy_service

ACTIVE_POLICIES = [
    {"id": "p1", "code": "6.1", "category": "delivery_delay", "is_active": True,
     "conditions": {"delay_hours_gt": 48}},
    {"id": "p2", "code": "4.2", "category": "refund", "is_active": True,
     "conditions": {"auto_approve_max_inr": 3000}},
    {"id": "p3", "code": "5.1", "category": "return", "is_active": True,
     "conditions": {"window_days": 10}},
]


def test_delivery_delay_eligible_when_past_threshold(fake_supabase):
    fake_supabase.seed("policies", ACTIVE_POLICIES)
    order = {"is_delayed": True, "delay_hours": 72, "order_value": 1000}
    result = policy_service.match_policy("delivery_delay", order)
    assert result["eligible"] is True
    assert result["policy"]["code"] == "6.1"


def test_delivery_delay_not_eligible_under_threshold(fake_supabase):
    fake_supabase.seed("policies", ACTIVE_POLICIES)
    order = {"is_delayed": True, "delay_hours": 10, "order_value": 1000}
    result = policy_service.match_policy("delivery_delay", order)
    assert result["eligible"] is False


def test_delivery_delay_not_eligible_when_not_delayed(fake_supabase):
    fake_supabase.seed("policies", ACTIVE_POLICIES)
    order = {"is_delayed": False, "delay_hours": 0, "order_value": 1000}
    result = policy_service.match_policy("delivery_delay", order)
    assert result["eligible"] is False


def test_refund_auto_approved_under_cap(fake_supabase):
    fake_supabase.seed("policies", ACTIVE_POLICIES)
    order = {"order_value": 899}
    result = policy_service.match_policy("refund", order)
    assert result["eligible"] is True


def test_refund_requires_escalation_above_cap(fake_supabase):
    fake_supabase.seed("policies", ACTIVE_POLICIES)
    order = {"order_value": 18400}
    result = policy_service.match_policy("refund", order)
    assert result["eligible"] is False


def test_unknown_intent_has_no_policy(fake_supabase):
    fake_supabase.seed("policies", ACTIVE_POLICIES)
    result = policy_service.match_policy("other", {})
    assert result["eligible"] is False
    assert result["policy"] is None


def test_missing_policy_category_is_not_eligible(fake_supabase):
    fake_supabase.seed("policies", [])
    result = policy_service.match_policy("return", {})
    assert result["eligible"] is False
    assert result["policy"] is None
