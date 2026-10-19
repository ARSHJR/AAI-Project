from app.services.action_service import execute_action, make_idempotency_key


def test_action_executes_and_returns_reference(fake_supabase):
    result = execute_action(
        ticket_id="t1",
        order_id="IN48213",
        action_type="delay_credit",
        amount=100.0,
        policy_id="p1",
        reasoning={"cause": "delay > 48h"},
        idempotency_key=make_idempotency_key("t1", "delay_credit"),
    )
    assert result["status"] == "success"
    assert result["reference_id"].startswith("CR-")
    assert result["duplicate"] is False


def test_duplicate_action_is_not_reexecuted(fake_supabase):
    key = make_idempotency_key("t1", "refund")
    first = execute_action(
        ticket_id="t1", order_id="IN1", action_type="refund", amount=500.0,
        policy_id="p2", reasoning={}, idempotency_key=key,
    )
    second = execute_action(
        ticket_id="t1", order_id="IN1", action_type="refund", amount=500.0,
        policy_id="p2", reasoning={}, idempotency_key=key,
    )
    assert first["reference_id"] == second["reference_id"]
    assert second["duplicate"] is True
    # Only one row should exist in the backing store
    assert len(fake_supabase._tables["actions"]) == 1


def test_different_tickets_get_independent_idempotency_keys():
    assert make_idempotency_key("t1", "refund") != make_idempotency_key("t2", "refund")


def test_same_ticket_different_action_types_get_independent_keys():
    assert make_idempotency_key("t1", "refund") != make_idempotency_key("t1", "delay_credit")
