import logging
from fastapi import APIRouter, Response, Request, HTTPException
from ..config import settings
from ..services.plex_auth import plex_auth_service
from ..models.db import get_session, delete_session

logger = logging.getLogger(__name__)
auth_router = APIRouter(prefix="/auth")

@auth_router.post("/pin")
async def create_auth_pin():
    """Generates a new Plex PIN and OAuth login URL"""
    pin_data = await plex_auth_service.create_pin()
    if not pin_data:
        raise HTTPException(status_code=500, detail="Failed to create Plex PIN")
    return pin_data

@auth_router.get("/pin/{pin_id}")
async def check_auth_pin(pin_id: int, request: Request, response: Response):
    """Polls Plex PIN status. If authorized, creates session and sets cookie"""
    result = await plex_auth_service.check_pin_and_login(pin_id)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to verify PIN")

    if result.get("status") == "authenticated":
        session_id = result["session_id"]
        is_https = (
            request.url.scheme == "https"
            or request.headers.get("x-forwarded-proto") == "https"
        )
        # Set HttpOnly session cookie
        response.set_cookie(
            key="session_token",
            value=session_id,
            max_age=settings.SESSION_EXPIRY_DAYS * 86400,
            httponly=True,
            samesite="lax",
            secure=is_https
        )
        return {
            "status": "authenticated",
            "token": session_id,
            "user": result["user"]
        }

    return result

@auth_router.get("/me")
async def get_current_user_status(request: Request):
    """Returns current auth state and user information"""
    if not settings.PLEX_AUTH_ENABLED:
        return {
            "auth_enabled": False,
            "authenticated": True,
            "user": {"username": "Admin (Auth Disabled)", "thumb": None}
        }

    session_id = request.cookies.get("session_token")
    if not session_id:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_id = auth_header.split("Bearer ")[1].strip()

    if session_id:
        session = get_session(session_id)
        if session:
            return {
                "auth_enabled": True,
                "authenticated": True,
                "user": {
                    "id": session["plex_user_id"],
                    "username": session["username"],
                    "email": session["email"],
                    "thumb": session["thumb"]
                }
            }

    return {
        "auth_enabled": True,
        "authenticated": False,
        "user": None
    }

@auth_router.post("/logout")
async def logout(request: Request, response: Response):
    """Clears user session and deletes cookie"""
    session_id = request.cookies.get("session_token")
    if not session_id:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_id = auth_header.split("Bearer ")[1].strip()
    if session_id:
        delete_session(session_id)
    response.delete_cookie("session_token")
    return {"status": "logged_out"}
