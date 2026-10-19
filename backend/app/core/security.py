from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.supabase_client import get_anon_client, get_service_client

bearer_scheme = HTTPBearer(auto_error=False)

ROLE_RANK = {"agent": 1, "supervisor": 2, "admin": 3}


class CurrentStaff:
    def __init__(self, user_id: str, email: str | None, full_name: str, role: str):
        self.user_id = user_id
        self.email = email
        self.full_name = full_name
        self.role = role


async def get_current_staff(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentStaff:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = credentials.credentials
    try:
        user_resp = get_anon_client().auth.get_user(token)
    except Exception as exc:  # noqa: BLE001 - surface as generic 401, never leak internals
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc

    user = getattr(user_resp, "user", None)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    profile_resp = (
        get_service_client()
        .table("staff_profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybe_single()
        .execute()
    )
    profile = profile_resp.data if profile_resp else None
    if profile is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No staff profile for this account")

    return CurrentStaff(
        user_id=user.id,
        email=user.email,
        full_name=profile["full_name"],
        role=profile["role"],
    )


def require_role(min_role: str):
    async def dependency(staff: CurrentStaff = Depends(get_current_staff)) -> CurrentStaff:
        if ROLE_RANK.get(staff.role, 0) < ROLE_RANK.get(min_role, 99):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role >= {min_role}")
        return staff

    return dependency
