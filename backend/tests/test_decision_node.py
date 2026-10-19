from app.agents.nodes import decision_node


def _base_state(**overrides):
    state = {
        "ticket_id": "t1",
        "customer_not_found": False,
        "order_not_found": False,
        "repeat_contact_escalate": False,
        "intent_confidence": 0.9,
        "multi_intent": [],
        "intent": "order_tracking",
        "policy_match": {"eligible": False, "reason": "n/a", "policy": None},
        "events": [],
    }
    state.update(overrides)
    return state


def test_order_tracking_is_reply_only():
    result = decision_node(_base_state(intent="order_tracking"))
    assert result["decision"] == "reply_only"


def test_delivery_delay_eligible_applies_credit():
    state = _base_state(intent="delivery_delay", policy_match={"eligible": True, "reason": "x", "policy": {}})
    result = decision_node(state)
    assert result["decision"] == "delay_credit"


def test_delivery_delay_not_eligible_is_reply_only():
    state = _base_state(intent="delivery_delay", policy_match={"eligible": False, "reason": "x", "policy": {}})
    result = decision_node(state)
    assert result["decision"] == "reply_only"


def test_refund_above_cap_escalates():
    state = _base_state(intent="refund", policy_match={"eligible": False, "reason": "over cap", "policy": {}})
    result = decision_node(state)
    assert result["decision"] == "escalation"


def test_low_confidence_always_escalates_regardless_of_intent():
    state = _base_state(intent="order_tracking", intent_confidence=0.3)
    result = decision_node(state)
    assert result["decision"] == "escalation"
    assert result["decision_reasoning"]["cause"] == "low_intent_confidence"


def test_multi_intent_conflict_escalates():
    state = _base_state(intent="refund", multi_intent=["refund", "order_tracking"])
    result = decision_node(state)
    assert result["decision"] == "escalation"


def test_customer_not_found_escalates():
    state = _base_state(customer_not_found=True)
    result = decision_node(state)
    assert result["decision"] == "escalation"


def test_repeat_contact_escalates_even_with_high_confidence():
    state = _base_state(intent="order_tracking", repeat_contact_escalate=True)
    result = decision_node(state)
    assert result["decision"] == "escalation"
    assert result["decision_reasoning"]["cause"] == "repeat_unresolved_contact"


def test_return_eligible_initiates_return():
    state = _base_state(intent="return", policy_match={"eligible": True, "reason": "x", "policy": {}})
    result = decision_node(state)
    assert result["decision"] == "return_initiation"
