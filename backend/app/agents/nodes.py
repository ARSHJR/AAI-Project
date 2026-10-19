"""LangGraph node implementations for the ticket-resolution workflow.

Each node is a plain function (state) -> partial state update, as LangGraph
expects. Deterministic checks guard every customer-impacting action; the LLM
is used only for language/intent understanding and reply drafting - never to
decide whether a refund/credit actually executes.
"""
import logging

from app.core.config import get_settings
from app.services import contact_service, policy_service
from app.services.action_service import execute_action, make_idempotency_key
from app.services.language_service import detect_language
from app.services.llm_service import LLMError, call_structured_llm
from app.services.order_service import (
    CustomerNotFoundError,
    OrderNotFoundError,
    find_customer,
    get_order_snapshot,
)

logger = logging.getLogger(__name__)

INTENTS = ["order_tracking", "delivery_delay", "refund", "wrong_item", "return", "other"]


def _log_event(state: dict, step: str, payload: dict, status: str = "ok") -> dict:
    events = list(state.get("events", []))
    events.append({"step": step, "payload": payload, "status": status})
    return {"events": events}


# ---------------------------------------------------------------------------
# 1. Ingestion is handled by the API layer (channel adapters) before the graph
#    is invoked - the graph starts from a normalized ticket row. See api/tickets.py.
# ---------------------------------------------------------------------------


# 2. Language Detection & Translation ---------------------------------------
def language_node(state: dict) -> dict:
    result = detect_language(state["raw_message"])
    settings = get_settings()
    update = {
        "detected_language": result["detected_language"],
        "script": result.get("script", "native"),
        "normalized_text": result.get("normalized", state["raw_message"]),
        "language_confidence": result.get("confidence", 0.5),
    }
    update.update(_log_event(state, "language", {**result}))
    if update["language_confidence"] < settings.language_confidence_min:
        update["status"] = "processing"
    return update


# 3. Intent Classification ---------------------------------------------------
def intent_node(state: dict) -> dict:
    text = state.get("normalized_text") or state["raw_message"]
    system_prompt = (
        "You classify e-commerce customer support messages into exactly one "
        "primary intent from this set: order_tracking, delivery_delay, refund, "
        "wrong_item, return, other. Messages may mention more than one topic; "
        "list secondary intents separately. Respond ONLY with JSON: "
        '{"intent": "<primary>", "confidence": 0.0-1.0, "multi_intent": ["..."]}'
    )
    try:
        result = call_structured_llm(system_prompt, text)
        intent = result.get("intent") if result.get("intent") in INTENTS else "other"
        confidence = float(result.get("confidence", 0.5))
        multi_intent = result.get("multi_intent", [])
    except LLMError as exc:
        logger.warning("Intent classification failed, defaulting to 'other': %s", exc)
        intent, confidence, multi_intent = "other", 0.0, []

    update = {"intent": intent, "intent_confidence": confidence, "multi_intent": multi_intent}
    update.update(_log_event(state, "intent", dict(update)))
    return update


# 4. Customer / Order identification + retrieval -----------------------------
def identify_and_retrieve_node(state: dict) -> dict:
    update: dict = {}
    customer = None
    try:
        if state.get("customer_id_hint"):
            customer = find_customer(customer_id=state["customer_id_hint"])
        elif state.get("order_id_hint"):
            customer = None  # resolved via order lookup below
        update["customer"] = customer
        update["customer_not_found"] = customer is None and not state.get("order_id_hint")
    except CustomerNotFoundError:
        update["customer"] = None
        update["customer_not_found"] = True

    order = None
    order_not_found = False
    order_id = state.get("order_id_hint")
    retries = state.get("order_lookup_retries", 0)
    if order_id:
        try:
            order = get_order_snapshot(order_id)
            if customer is None:
                try:
                    update["customer"] = find_customer(customer_id=order["customer_id"])
                    update["customer_not_found"] = False
                except CustomerNotFoundError:
                    update["customer_not_found"] = True
        except OrderNotFoundError:
            order_not_found = True
        except Exception as exc:  # noqa: BLE001 - simulate backend failure + retry
            if retries < 1:
                logger.warning("Order lookup failed, will retry once: %s", exc)
                update["order_lookup_retries"] = retries + 1
                update["order"] = None
                update.update(_log_event(state, "order_lookup", {"error": str(exc)}, status="retry"))
                return update
            order_not_found = True
            update.update(_log_event(state, "order_lookup", {"error": str(exc)}, status="error"))

    update["order"] = order
    update["order_not_found"] = order_not_found
    update.update(_log_event(state, "order_lookup", {"order": order, "order_not_found": order_not_found}))
    return update


# 5. Policy & FAQ matching ----------------------------------------------------
def policy_node(state: dict) -> dict:
    match = policy_service.match_policy(state.get("intent", "other"), state.get("order"))
    update = {"policy_match": match}
    update.update(_log_event(state, "policy_match", match))
    return update


# Repeat-contact check (feeds into decision) ---------------------------------
def repeat_contact_node(state: dict) -> dict:
    customer = state.get("customer")
    if not customer:
        return {"repeat_contact_count": 0, "repeat_contact_escalate": False}
    order_id = (state.get("order") or {}).get("order_id") or state.get("order_id_hint")
    # +1 because this ticket's own contact_history row hasn't been recorded
    # yet (that happens after the graph finishes) - "3rd contact" must count
    # the current message, not just the ones strictly before it.
    count = contact_service.unresolved_contact_count(customer["id"], order_id) + 1
    escalate = count >= get_settings().repeat_contact_escalation_threshold
    update = {"repeat_contact_count": count, "repeat_contact_escalate": escalate}
    update.update(_log_event(state, "repeat_contact", dict(update)))
    return update


# 6. Action Decision -----------------------------------------------------------
HIGH_VALUE_INTENTS = {"refund", "wrong_item", "return"}

# Secondary intents the LLM flags that describe the SAME underlying request
# as the primary intent rather than a genuinely different one needing human
# disambiguation - e.g. "wrong item, need a refund" is one request (wrong_item
# is the stated cause of the refund), and "order is late, when will it
# arrive" is one request (delivery_delay is why the customer is tracking).
# A real conflict looks like the spec's own example: tracking + refund in one
# message, which point to different remedies.
COMPATIBLE_INTENT_GROUPS = [
    {"order_tracking", "delivery_delay"},
    {"refund", "wrong_item", "damaged_item"},
]


def _has_conflicting_multi_intent(primary: str, multi_intent: list[str]) -> bool:
    if not multi_intent:
        return False
    group = next((g for g in COMPATIBLE_INTENT_GROUPS if primary in g), {primary})
    return any(secondary != primary and secondary not in group for secondary in multi_intent)


def decision_node(state: dict) -> dict:
    settings = get_settings()
    reasoning: dict = {}

    if state.get("customer_not_found") or state.get("order_not_found"):
        decision = "escalation"
        reasoning["cause"] = "customer_or_order_not_found"
    elif state.get("repeat_contact_escalate"):
        decision = "escalation"
        reasoning["cause"] = "repeat_unresolved_contact"
    elif state.get("intent_confidence", 0) < settings.intent_confidence_auto_threshold:
        decision = "escalation"
        reasoning["cause"] = "low_intent_confidence"
    elif _has_conflicting_multi_intent(state.get("intent", "other"), state.get("multi_intent", [])):
        decision = "escalation"
        reasoning["cause"] = "multi_intent_conflict"
    elif state.get("intent") == "order_tracking":
        decision = "reply_only"
        reasoning["cause"] = "informational_tracking_reply"
    elif state.get("intent") == "delivery_delay":
        match = state.get("policy_match") or {}
        decision = "delay_credit" if match.get("eligible") else "reply_only"
        reasoning["cause"] = match.get("reason")
    elif state.get("intent") in ("refund", "wrong_item"):
        match = state.get("policy_match") or {}
        decision = "refund" if match.get("eligible") else "escalation"
        reasoning["cause"] = match.get("reason")
    elif state.get("intent") == "return":
        match = state.get("policy_match") or {}
        decision = "return_initiation" if match.get("eligible") else "escalation"
        reasoning["cause"] = match.get("reason")
    else:
        decision = "escalation"
        reasoning["cause"] = "unsupported_or_ambiguous_intent"

    update = {"decision": decision, "decision_reasoning": reasoning}
    update.update(_log_event(state, "decision", dict(update)))
    return update


# 7. Action Execution ----------------------------------------------------------
def execution_node(state: dict) -> dict:
    settings = get_settings()
    decision = state["decision"]
    order = state.get("order") or {}
    policy_match = state.get("policy_match") or {}
    policy = policy_match.get("policy") or {}

    amount = None
    if decision == "delay_credit":
        amount = settings.delay_compensation_inr
    elif decision == "refund":
        amount = order.get("order_value")

    idem_key = make_idempotency_key(state["ticket_id"], decision)
    try:
        result = execute_action(
            ticket_id=state["ticket_id"],
            order_id=order.get("order_id"),
            action_type=decision,
            amount=amount,
            policy_id=policy.get("id"),
            reasoning=state.get("decision_reasoning", {}),
            idempotency_key=idem_key,
        )
        execution_failed = result.get("status") != "success"
    except Exception as exc:  # noqa: BLE001
        logger.error("Action execution raised: %s", exc)
        result = {"status": "failed", "error": str(exc)}
        execution_failed = True

    update = {"action_result": result, "execution_failed": execution_failed}
    update.update(_log_event(state, "action_execution", result, status="error" if execution_failed else "ok"))
    return update


# 8. Escalation -----------------------------------------------------------------
def escalation_node(state: dict) -> dict:
    reasons = []
    if state.get("customer_not_found"):
        reasons.append("Customer could not be identified")
    if state.get("order_not_found"):
        reasons.append("Order could not be found")
    if state.get("repeat_contact_escalate"):
        reasons.append(f"Repeat unresolved contact (count={state.get('repeat_contact_count')})")
    if state.get("execution_failed"):
        reasons.append("Action execution failed")
    cause = (state.get("decision_reasoning") or {}).get("cause")
    if cause and cause not in str(reasons):
        reasons.append(str(cause))
    if not reasons:
        reasons.append("Decision engine routed to escalation")

    urgency = "high" if (state.get("order") or {}).get("order_value", 0) > get_settings().refund_auto_approve_max_inr else "medium"
    if state.get("repeat_contact_escalate"):
        urgency = "high"

    summary = {
        "intent": state.get("intent"),
        "intent_confidence": state.get("intent_confidence"),
        "language": state.get("detected_language"),
        "customer": state.get("customer"),
        "order": state.get("order"),
        "policy_match": state.get("policy_match"),
        "reasons": reasons,
        "raw_message": state.get("raw_message"),
    }

    update = {
        "escalation_reason": "; ".join(reasons),
        "escalation_urgency": urgency,
        "escalation_summary": summary,
        "status": "escalated",
    }
    update.update(_log_event(state, "escalation", dict(update)))
    return update


# 9. Multilingual Response Drafting ---------------------------------------------
def response_node(state: dict) -> dict:
    language = state.get("detected_language", "en")
    channel = state.get("channel", "chat")

    if state.get("status") == "escalated":
        grounding = (
            "This has been escalated to a human support agent who will follow up shortly. "
            f"Reason: {state.get('escalation_reason')}"
        )
    else:
        order = state.get("order") or {}
        action = state.get("action_result") or {}
        grounding = (
            f"intent={state.get('intent')}; order_id={order.get('order_id')}; "
            f"order_status={order.get('status')}; eta={order.get('eta')}; "
            f"decision={state.get('decision')}; action_reference={action.get('reference_id')}; "
            f"action_amount={action.get('amount')}"
        )

    system_prompt = (
        "You draft the final customer-facing support reply. Write ONLY in "
        f"language code '{language}' (en=English, hi=Hindi, mr=Marathi), using "
        f"Romanized script if the customer wrote Romanized text, matching the "
        f"casual tone of '{channel}' if it is whatsapp/chat or a more formal "
        "tone if it is email. You MUST only state facts given in the grounding "
        "data below - never invent order status, dates, or amounts. Keep it to "
        "2-4 sentences. Respond ONLY with JSON: {\"reply\": \"<message>\"}"
    )
    user_prompt = f"Customer message: {state.get('raw_message')}\nGrounding data: {grounding}"

    try:
        result = call_structured_llm(system_prompt, user_prompt)
        reply = result.get("reply", "").strip()
        if not reply:
            raise LLMError("empty reply")
    except LLMError:
        reply = _fallback_reply(language, grounding, state)

    update = {"final_response": reply}
    update.update(_log_event(state, "response_drafting", {"reply": reply, "language": language}))
    return update


def _fallback_reply(language: str, grounding: str, state: dict) -> str:
    """Deterministic templated fallback if the LLM is unavailable/misbehaves."""
    if state.get("status") == "escalated":
        templates = {
            "en": "Thanks for reaching out - we've forwarded your request to a specialist who will follow up shortly.",
            "hi": "Dhanyavaad - humne aapki request ek specialist ko forward kar di hai, woh jald hi aapse sampark karenge.",
            "mr": "Dhanyavad - amhi tumchi request tajna tajnane pathavli aahe, te lavkarach tumhyashi sampark karteel.",
        }
        return templates.get(language, templates["en"])

    order = state.get("order") or {}
    action = state.get("action_result") or {}
    templates = {
        "en": f"Your order {order.get('order_id', '')} is currently {order.get('status', 'being processed')}.",
        "hi": f"Aapka order {order.get('order_id', '')} abhi {order.get('status', 'process ho raha hai')} status mein hai.",
        "mr": f"Tumcha order {order.get('order_id', '')} sध्या {order.get('status', 'process houn rahila aahe')}.",
    }
    base = templates.get(language, templates["en"])
    if action.get("reference_id"):
        base += f" Reference: {action['reference_id']}."
    return base
