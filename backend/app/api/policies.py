from fastapi import APIRouter, Depends

from app.core.security import CurrentStaff, get_current_staff
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("")
def list_policies(category: str | None = None, staff: CurrentStaff = Depends(get_current_staff)):
    client = get_service_client()
    query = client.table("policies").select("*").eq("is_active", True).order("category")
    if category:
        query = query.eq("category", category)
    resp = query.execute()
    return resp.data or []


@router.get("/{policy_id}")
def get_policy(policy_id: str, staff: CurrentStaff = Depends(get_current_staff)):
    client = get_service_client()
    resp = client.table("policies").select("*").eq("id", policy_id).maybe_single().execute()
    return resp.data if resp else None
