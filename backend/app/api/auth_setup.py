"""
One-time setup endpoint to create the initial admin user via the Supabase Admin API.
This bypasses email confirmation entirely by using the service_role_key.
"""

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.config import get_settings

router = APIRouter()


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "admin"


class CreateUserResponse(BaseModel):
    id: str
    email: str
    role: str
    message: str


@router.post("/create-user", response_model=CreateUserResponse)
async def create_user(body: CreateUserRequest):
    """Create a user via the Supabase Admin API with auto-confirmed email.

    This endpoint uses the service_role_key so no confirmation email is sent.
    The user can immediately log in with their password.
    """
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase ist nicht konfiguriert (URL oder Service Role Key fehlt).",
        )

    if len(body.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwort muss mindestens 6 Zeichen lang sein.",
        )

    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }

    # Create user via Supabase Admin API (auto-confirms email)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{settings.supabase_url}/auth/v1/admin/users",
                headers=headers,
                json={
                    "email": body.email,
                    "password": body.password,
                    "email_confirm": True,
                    "app_metadata": {"role": body.role},
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Supabase ist nicht erreichbar: {exc}",
        ) from exc

    if response.status_code == 422:
        detail = response.json()
        msg = detail.get("msg") or detail.get("message") or str(detail)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Supabase hat die Anfrage abgelehnt: {msg}",
        )

    if response.status_code not in (200, 201):
        detail = response.text
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Supabase-Fehler ({response.status_code}): {detail}",
        )

    user_data = response.json()
    return CreateUserResponse(
        id=user_data["id"],
        email=user_data.get("email", body.email),
        role=body.role,
        message="User erfolgreich erstellt. Du kannst dich jetzt mit E-Mail und Passwort anmelden.",
    )
