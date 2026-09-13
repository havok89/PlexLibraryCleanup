from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, Depends
from ..config import settings
from ..models.db import get_session

async def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    """
    Validates the active session. If PLEX_AUTH_ENABLED is False, authentication is bypassed.
    """
    if not settings.PLEX_AUTH_ENABLED:
        return {"username": "Admin (Local)", "is_admin": True}

    # Check session cookie or Authorization header
    session_id = request.cookies.get("session_token")
    if not session_id:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_id = auth_header.split("Bearer ")[1].strip()

    if not session_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    return session
