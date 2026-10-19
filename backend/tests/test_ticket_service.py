from app.services.ticket_service import ingest_message


def test_ingest_creates_new_ticket(fake_supabase):
    ticket = ingest_message("whatsapp", "T-1", "Mera order late hai")
    assert ticket["duplicate"] is False
    assert ticket["raw_message"] == "Mera order late hai"
    assert len(fake_supabase._tables["tickets"]) == 1


def test_duplicate_message_within_window_is_not_reinserted(fake_supabase):
    first = ingest_message("whatsapp", "T-1", "Mera order late hai")
    second = ingest_message("whatsapp", "T-1", "Mera order late hai")
    assert second["duplicate"] is True
    assert second["id"] == first["id"]
    assert len(fake_supabase._tables["tickets"]) == 1


def test_different_thread_is_not_a_duplicate(fake_supabase):
    ingest_message("whatsapp", "T-1", "Mera order late hai")
    second = ingest_message("whatsapp", "T-2", "Mera order late hai")
    assert second["duplicate"] is False
    assert len(fake_supabase._tables["tickets"]) == 2
