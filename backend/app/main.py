import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, dashboard, policies, tickets
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO)

settings = get_settings()

app = FastAPI(
    title="Multilingual Order Support Copilot",
    description="Autonomous multi-agent support resolution system (PS-14)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(dashboard.router)
app.include_router(policies.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "supabase_configured": settings.supabase_configured,
        "llm_configured": settings.llm_configured,
        "llm_provider": settings.llm_provider,
    }
