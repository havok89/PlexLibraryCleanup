import logging
from typing import Dict, Any, Optional
import httpx
from ..config import settings

logger = logging.getLogger(__name__)

class SeerrClient:
    def __init__(self):
        self.url = (settings.OVERSEERR_URL or "").strip().rstrip("/")
        api_key = (settings.OVERSEERR_API_KEY or "").strip().strip("\"'")
        # Overseerr/Seerr generates base64-encoded keys. If trailing '=' padding was dropped, auto-pad it
        if len(api_key) % 4 != 0 and all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/" for c in api_key):
            api_key += "=" * (4 - (len(api_key) % 4))
        self.api_key = api_key
        self.headers = {
            "X-Api-Key": self.api_key,
            "Accept": "application/json"
        }

    @property
    def is_configured(self) -> bool:
        return bool(self.url and self.api_key)

    async def get_requests_map(self) -> Dict[str, Dict[str, Any]]:
        """
        Returns a mapping of media identifiers (tmdb_id, tvdb_id, title) to request details:
        {
            "tmdb:12345": {
                "requested_by_id": 2,
                "requested_by_name": "JohnDoe",
                "requested_by_avatar": "https://...",
                "is_admin": False,
                "requested_at": "2024-01-01"
            }
        }
        """
        if not self.is_configured:
            return {}

        results: Dict[str, Dict[str, Any]] = {}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Fetch users first to identify admin
                admin_ids = set()
                try:
                    users_res = await client.get(f"{self.url}/api/v1/user", headers=self.headers)
                    if users_res.status_code == 200:
                        for u in users_res.json().get("results", []):
                            # permissions 2 is admin in Overseerr
                            if u.get("permissions", 0) & 2 != 0 or u.get("id") == 1:
                                admin_ids.add(u.get("id"))
                except Exception as e:
                    logger.warning(f"Could not fetch Overseerr users: {e}")

                # Fetch all requests
                skip = 0
                take = 100
                while True:
                    res = await client.get(
                        f"{self.url}/api/v1/request?skip={skip}&take={take}&sort=added",
                        headers=self.headers
                    )
                    if res.status_code != 200:
                        logger.error(f"Failed to fetch requests from Overseerr: {res.status_code} - {res.text}")
                        break

                    data = res.json()
                    requests = data.get("results", [])
                    if not requests:
                        break

                    for req in requests:
                        media = req.get("media", {})
                        requested_by = req.get("requestedBy", {})
                        user_id = requested_by.get("id")
                        user_name = requested_by.get("displayName") or requested_by.get("username") or "Unknown"
                        avatar = requested_by.get("avatar")
                        is_admin = user_id in admin_ids if admin_ids else (user_id == 1)

                        info = {
                            "request_id": req.get("id"),
                            "requested_by_id": user_id,
                            "requested_by_name": user_name,
                            "requested_by_avatar": avatar,
                            "is_admin": is_admin,
                            "requested_by_other": not is_admin,
                            "created_at": req.get("createdAt")
                        }

                        tmdb_id = media.get("tmdbId")
                        tvdb_id = media.get("tvdbId")
                        if tmdb_id:
                            results[f"tmdb:{tmdb_id}"] = info
                        if tvdb_id:
                            results[f"tvdb:{tvdb_id}"] = info

                    skip += take
                    if skip >= data.get("pageInfo", {}).get("results", 0):
                        break

        except Exception as e:
            logger.error(f"Error communicating with Overseerr/Jellyseerr: {e}")

        return results

seerr_client = SeerrClient()
