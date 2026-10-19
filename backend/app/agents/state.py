"""Shared state object threaded through the LangGraph ticket-resolution graph."""
from typing import Any, TypedDict


class TicketState(TypedDict, total=False):
    # Ingestion
    ticket_id: str
    channel: str
    thread_id: str
    customer_id_hint: str | None  # phone/customer id attached by the channel adapter
    order_id_hint: str | None
    raw_message: str

    # Language
    detected_language: str
    script: str
    normalized_text: str
    language_confidence: float

    # Intent
    intent: str
    intent_confidence: float
    multi_intent: list[str]

    # Identification
    customer: dict | None
    customer_not_found: bool

    # Order retrieval
    order: dict | None
    order_not_found: bool
    order_lookup_retries: int

    # Policy
    policy_match: dict | None

    # Repeat contact
    repeat_contact_count: int
    repeat_contact_escalate: bool

    # Decision
    decision: str  # reply_only | refund | return_initiation | delay_credit | escalation
    decision_reasoning: dict

    # Execution
    action_result: dict | None
    execution_failed: bool

    # Escalation
    escalation_reason: str | None
    escalation_urgency: str | None
    escalation_summary: dict | None

    # Response
    final_response: str

    # Bookkeeping
    events: list[dict[str, Any]]
    status: str  # received | processing | auto_resolved | escalated | failed
