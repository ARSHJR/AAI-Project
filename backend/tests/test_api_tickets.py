from fastapi.testclient import TestClient

from app.core.security import CurrentStaff, get_current_staff, require_role
from app.main import app

AGENT = CurrentStaff(user_id="u1", email="agent@example.com", full_name="Agent", role="agent")
SUPERVISOR = CurrentStaff(user_id="u2", email="sup@example.com", full_name="Supervisor", role="supervisor")


def test_tickets_endpoint_requires_auth():
    client = TestClient(app)
    resp = client.get("/tickets")
    assert resp.status_code == 401


def test_tickets_endpoint_works_when_authenticated(fake_supabase):
    app.dependency_overrides[get_current_staff] = lambda: AGENT
    client = TestClient(app)
    try:
        resp = client.get("/tickets")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


def test_retry_requires_supervisor_role(fake_supabase):
    app.dependency_overrides[get_current_staff] = lambda: AGENT
    client = TestClient(app)
    try:
        resp = client.post("/tickets/does-not-exist/retry")
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_retry_allowed_for_supervisor_but_404_on_missing_ticket(fake_supabase):
    app.dependency_overrides[get_current_staff] = lambda: SUPERVISOR
    client = TestClient(app)
    try:
        resp = client.post("/tickets/does-not-exist/retry")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_create_ticket_rejects_invalid_channel(fake_supabase):
    app.dependency_overrides[get_current_staff] = lambda: AGENT
    client = TestClient(app)
    try:
        resp = client.post("/tickets", json={"channel": "fax", "thread_id": "T-1", "text": "hi"})
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()
