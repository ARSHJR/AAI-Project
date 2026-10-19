from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_service_client() -> Client:
    """Service-role client for backend use only. Bypasses RLS.

    Never expose the service_role key to the frontend; this client must only
    be constructed inside backend request handlers / agents.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@lru_cache
def get_anon_client() -> Client:
    """Anon client, used only to verify a user's JWT via auth.get_user()."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key)
