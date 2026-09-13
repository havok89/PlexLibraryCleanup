import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import httpx
from ..config import settings
from ..models.db import create_session, get_session, delete_session

logger = logging.getLogger(__name__)

PLEX_HEADERS = {
    "X-Plex-Product": "Plex Clean & Curate",
    "X-Plex-Version": "1.0.0",
    "X-Plex-Device": "Web Dashboard",
    "X-Plex-Device-Name": "Plex Clean & Curate",
    "X-Plex-Platform": "Web",
    "Accept": "application/json"
}

class PlexAuthService:
    def __init__(self):
        self.client_id = settings.CLIENT_IDENTIFIER

    async def create_pin(self) -> Optional[Dict[str, Any]]:
        """Creates a Plex PIN for OAuth login"""
        headers = {**PLEX_HEADERS, "X-Plex-Client-Identifier": self.client_id}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    "https://plex.tv/api/v2/pins",
                    headers=headers,
                    data={"strong": "true"}
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    pin_id = data.get("id")
                    code = data.get("code")
                    auth_url = (
                        f"https://app.plex.tv/auth#?clientID={self.client_id}"
                        f"&code={code}&context%5Bdevice%5D%5Bproduct%5D=Plex%20Clean%20%26%20Curate"
                    )
                    return {
                        "id": pin_id,
                        "code": code,
                        "auth_url": auth_url
                    }
                else:
                    logger.error(f"Failed to create Plex PIN: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Error creating Plex PIN: {e}")
        return None

    async def get_server_owner_identity(self) -> Optional[Dict[str, Any]]:
        """Fetches the identity of the server owner using PLEX_TOKEN"""
        if not settings.PLEX_TOKEN:
            return None
        headers = {**PLEX_HEADERS, "X-Plex-Token": settings.PLEX_TOKEN}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get("https://plex.tv/api/v2/user", headers=headers)
                if res.status_code == 200:
                    return res.json()
        except Exception as e:
            logger.warning(f"Failed to fetch server owner info from plex.tv: {e}")
        return None

    async def check_pin_and_login(self, pin_id: int) -> Optional[Dict[str, Any]]:
        """Checks if PIN has been authorized, validates user is server owner, and creates session"""
        headers = {**PLEX_HEADERS, "X-Plex-Client-Identifier": self.client_id}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(f"https://plex.tv/api/v2/pins/{pin_id}", headers=headers)
                if res.status_code != 200:
                    return None

                data = res.json()
                auth_token = data.get("authToken")
                if not auth_token:
                    # Still waiting for user authorization on plex.tv
                    return {"status": "waiting"}

                # Pin authorized! Now fetch the user's profile
                user_res = await client.get(
                    "https://plex.tv/api/v2/user",
                    headers={**headers, "X-Plex-Token": auth_token}
                )
                if user_res.status_code != 200:
                    logger.error(f"Failed to fetch user with auth_token: {user_res.status_code}")
                    return {"status": "error", "message": "Failed to fetch user profile"}

                user_data = user_res.json()
                user_id = str(user_data.get("id"))
                username = user_data.get("username") or user_data.get("title") or "Plex User"
                email = user_data.get("email")
                thumb = user_data.get("thumb")

                # Verify server owner
                owner_info = await self.get_server_owner_identity()
                if owner_info:
                    owner_id = str(owner_info.get("id"))
                    owner_email = owner_info.get("email")
                    owner_username = owner_info.get("username")

                    # If not the server owner, reject
                    if user_id != owner_id and email != owner_email and username != owner_username:
                        logger.warning(f"Unauthorized login attempt: {username} ({email}) is not server owner {owner_username}")
                        return {
                            "status": "unauthorized",
                            "message": "Only the Plex Server Admin / Owner is permitted to access this dashboard."
                        }

                # Create user session
                session_id = secrets.token_urlsafe(32)
                expires_at = datetime.utcnow() + timedelta(days=settings.SESSION_EXPIRY_DAYS)
                create_session(
                    session_id=session_id,
                    plex_user_id=user_id,
                    username=username,
                    email=email,
                    thumb=thumb,
                    expires_at=expires_at
                )

                return {
                    "status": "authenticated",
                    "session_id": session_id,
                    "user": {
                        "id": user_id,
                        "username": username,
                        "email": email,
                        "thumb": thumb
                    }
                }

        except Exception as e:
            logger.error(f"Error verifying Plex PIN {pin_id}: {e}")
            return {"status": "error", "message": str(e)}

plex_auth_service = PlexAuthService()
