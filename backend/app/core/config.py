from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = "https://placeholder.supabase.co"
    supabase_anon_key: str = "placeholder"
    supabase_service_role_key: str = "placeholder"
    supabase_db_url: str = ""

    # LLM providers
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    llm_provider: str = "groq"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Business configuration (demo defaults, override via env)
    delay_compensation_inr: float = 100.0
    delay_compensation_threshold_hours: float = 48.0
    refund_auto_approve_max_inr: float = 3000.0
    return_window_days: int = 10
    repeat_contact_escalation_threshold: int = 3
    intent_confidence_auto_threshold: float = 0.75
    language_confidence_min: float = 0.5

    # App
    environment: str = "development"
    frontend_origin: str = "http://localhost:5173"
    api_port: int = 8000

    @property
    def llm_configured(self) -> bool:
        if self.llm_provider == "groq":
            return bool(self.groq_api_key)
        if self.llm_provider == "gemini":
            return bool(self.gemini_api_key)
        return False

    @property
    def supabase_configured(self) -> bool:
        return (
            "placeholder" not in self.supabase_url
            and "placeholder" not in self.supabase_service_role_key
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
