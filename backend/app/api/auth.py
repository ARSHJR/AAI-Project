from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import CurrentStaff, get_current_staff
from app.db.supabase_client import get_anon_client, get_service_client

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    full_name: str
    role: str
    email: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    try:
        auth_resp = get_anon_client().auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password") from exc

    if not auth_resp.session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    profile = (
        get_service_client()
        .table("staff_profiles")
        .select("full_name, role")
        .eq("id", auth_resp.user.id)
        .maybe_single()
        .execute()
    )
    if not profile or not profile.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No staff profile provisioned for this account")

    return LoginResponse(
        access_token=auth_resp.session.access_token,
        full_name=profile.data["full_name"],
        role=profile.data["role"],
        email=auth_resp.user.email,
    )


@router.get("/me")
def me(staff: CurrentStaff = Depends(get_current_staff)):
    return {"email": staff.email, "full_name": staff.full_name, "role": staff.role}
