from app.services import contact_service


def test_unresolved_contact_count_increments(fake_supabase):
    contact_service.record_contact("C-1", "IN1", "t1")
    contact_service.record_contact("C-1", "IN1", "t2")
    assert contact_service.unresolved_contact_count("C-1", "IN1") == 2


def test_resolved_contacts_are_excluded_from_count(fake_supabase):
    contact_service.record_contact("C-1", "IN1", "t1")
    contact_service.mark_resolved("t1")
    assert contact_service.unresolved_contact_count("C-1", "IN1") == 0


def test_escalation_threshold_respected(fake_supabase, monkeypatch):
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("REPEAT_CONTACT_ESCALATION_THRESHOLD", "2")
    get_settings.cache_clear()

    contact_service.record_contact("C-1", "IN1", "t1")
    assert contact_service.should_escalate_for_repeat_contact("C-1", "IN1") is False
    contact_service.record_contact("C-1", "IN1", "t2")
    assert contact_service.should_escalate_for_repeat_contact("C-1", "IN1") is True

    get_settings.cache_clear()
