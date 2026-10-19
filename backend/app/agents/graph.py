"""Orchestrator: wires the LangGraph StateGraph for ticket resolution.

Flow:
  language -> intent -> identify_and_retrieve -> policy_match -> repeat_contact
  -> decision -> (execution -> maybe escalation_on_failure) | escalation
  -> response

Branching:
  - decision_node routes to "escalation" when identification fails, intent
    confidence is low, intents conflict, repeat-contact threshold is hit, or
    policy conditions are not met for a money-moving action.
  - execution_node failures route to escalation_node rather than silently
    returning a false-success reply (see route_after_execution).

Retries:
  - identify_and_retrieve_node retries an order-lookup failure once internally
    (order_lookup_retries) before surfacing order_not_found, which the graph
    then routes to escalation via decision_node.
"""
from langgraph.graph import END, StateGraph

from app.agents.nodes import (
    decision_node,
    escalation_node,
    execution_node,
    identify_and_retrieve_node,
    intent_node,
    language_node,
    policy_node,
    repeat_contact_node,
    response_node,
)
from app.agents.state import TicketState


def route_after_decision(state: dict) -> str:
    return "execution" if state["decision"] != "escalation" else "escalation"


def route_after_execution(state: dict) -> str:
    return "escalation" if state.get("execution_failed") else "response"


def build_graph():
    graph = StateGraph(TicketState)

    graph.add_node("detect_language", language_node)
    graph.add_node("classify_intent", intent_node)
    graph.add_node("identify_and_retrieve", identify_and_retrieve_node)
    graph.add_node("match_policy", policy_node)
    graph.add_node("check_repeat_contact", repeat_contact_node)
    graph.add_node("decide_action", decision_node)
    graph.add_node("execute_action", execution_node)
    graph.add_node("escalate", escalation_node)
    graph.add_node("draft_response", response_node)

    graph.set_entry_point("detect_language")
    graph.add_edge("detect_language", "classify_intent")
    graph.add_edge("classify_intent", "identify_and_retrieve")
    graph.add_edge("identify_and_retrieve", "match_policy")
    graph.add_edge("match_policy", "check_repeat_contact")
    graph.add_edge("check_repeat_contact", "decide_action")

    graph.add_conditional_edges(
        "decide_action", route_after_decision, {"execution": "execute_action", "escalation": "escalate"}
    )
    graph.add_conditional_edges(
        "execute_action", route_after_execution, {"response": "draft_response", "escalation": "escalate"}
    )
    graph.add_edge("escalate", "draft_response")
    graph.add_edge("draft_response", END)

    return graph.compile()


_compiled_graph = None


def get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()
    return _compiled_graph
