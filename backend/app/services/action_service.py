"""Action execution against simulated backend systems (refund/credit/return).

Safety properties:
- Every action requires an idempotency_key so retries/duplicate webhook
  deliveries cannot double-execute a refund or credit.
- Amounts/eligibility are never trusted from the LLM - callers must pass
  values already validated by policy_service's deterministic checks.
"""
import uuid

from app.db.supabase_client import get_service_client


class DuplicateActionError(Exception):
    pass


def _reference_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


def _existing_action(idempotency_key: str) -> dict | None:
    client = get_service_client()
    resp = (
        client.table("actions")
        .select("*")
        .eq("idempotency_key", idempotency_key)
        .maybe_single()
        .execute()
    )
    return resp.data if resp else None


def execute_action(
    ticket_id: str,
    order_id: str | None,
    action_type: str,
    amount: float | None,
    policy_id: str | None,
    reasoning: dict,
    idempotency_key: str,
) -> dict:
    """Executes (or returns the already-executed result for) an action.

    action_type in: reply_only, refund, return_initiation, delay_credit, escalation
    """
    existing = _existing_action(idempotency_key)
    if existing is not None:
        return {**existing, "duplicate": True}

    client = get_service_client()

    # Simulate calling the relevant backend system and obtaining a reference.
    if action_type == "delay_credit":
        reference_id = _reference_id("CR")
    elif action_type == "refund":
        reference_id = _reference_id("RF")
    elif action_type == "return_initiation":
        reference_id = _reference_id("RT")
    else:
        reference_id = _reference_id("ACT")

    row = {
        "ticket_id": ticket_id,
        "order_id": order_id,
        "action_type": action_type,
        "amount": amount,
        "status": "success",
        "reference_id": reference_id,
        "idempotency_key": idempotency_key,
        "policy_id": policy_id,
        "reasoning": reasoning,
    }

    try:
        resp = client.table("actions").insert(row).execute()
    except Exception as exc:  # noqa: BLE001
        # Unique constraint race: another concurrent request already inserted it.
        existing = _existing_action(idempotency_key)
        if existing is not None:
            return {**existing, "duplicate": True}
        row["status"] = "failed"
        row["reasoning"] = {**reasoning, "error": str(exc)}
        return row

    inserted = resp.data[0] if resp.data else row
    return {**inserted, "duplicate": False}


def make_idempotency_key(ticket_id: str, action_type: str) -> str:
    """One action of a given type per ticket - a ticket that's retried or
    re-processed never re-executes the same refund/credit twice."""
    return f"{ticket_id}:{action_type}"
