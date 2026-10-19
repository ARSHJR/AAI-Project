from pydantic import BaseModel, Field


class IncomingMessage(BaseModel):
    channel: str = Field(pattern="^(chat|email|whatsapp)$")
    thread_id: str
    text: str = Field(min_length=1, max_length=4000)
    customer_id: str | None = None
    order_id: str | None = None


class TicketOut(BaseModel):
    id: str
    channel: str
    thread_id: str
    customer_id: str | None = None
    order_id: str | None = None
    raw_message: str
    detected_language: str | None = None
    script: str | None = None
    intent: str | None = None
    intent_confidence: float | None = None
    multi_intent: list[str] | None = None
    status: str
    action_taken: str | None = None
    escalation_reason: str | None = None
    urgency: str | None = None
    final_response: str | None = None
    resolution_time_ms: int | None = None
    created_at: str | None = None


class TicketDetailOut(TicketOut):
    events: list[dict] = []
    actions: list[dict] = []
    escalation: dict | None = None
