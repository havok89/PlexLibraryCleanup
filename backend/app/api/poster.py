import logging
from typing import Dict, Tuple
from fastapi import APIRouter, HTTPException, Query, Response
import httpx
from ..config import settings

logger = logging.getLogger(__name__)
poster_router = APIRouter()

# In-memory poster cache: {thumb_path: (content_bytes, content_type)}
_poster_cache: Dict[str, Tuple[bytes, str]] = {}
MAX_CACHE_ITEMS = 500

@poster_router.get("/poster")
async def get_poster(thumb: str = Query(..., description="Plex thumbnail path")):
    """
    Proxies and caches Plex poster images to support external access,
    prevent mixed-content HTTP blocking over HTTPS, and keep Plex tokens secure.
    """
    if not thumb:
        raise HTTPException(status_code=400, detail="Missing thumb parameter")

    # If full URL was passed, extract path
    if "/library/metadata/" in thumb:
        idx = thumb.find("/library/metadata/")
        thumb = thumb[idx:].split("?")[0]
    elif "/photo/:" in thumb:
        idx = thumb.find("/photo/:")
        thumb = thumb[idx:].split("?")[0]

    # Security check: must start with safe Plex image path and no traversal
    if not (thumb.startswith("/library/metadata/") or thumb.startswith("/photo/")):
        raise HTTPException(status_code=400, detail="Invalid thumbnail path")
    if ".." in thumb:
        raise HTTPException(status_code=400, detail="Invalid path traversal")

    # Check in-memory cache
    if thumb in _poster_cache:
        cached_content, cached_type = _poster_cache[thumb]
        return Response(
            content=cached_content,
            media_type=cached_type,
            headers={
                "Cache-Control": "public, max-age=604800, immutable",
                "X-Cache": "HIT"
            }
        )

    plex_url = (settings.PLEX_URL or "").rstrip("/")
    token = settings.PLEX_TOKEN
    if not plex_url or not token:
        raise HTTPException(status_code=503, detail="Plex server not configured")

    # Request optimized web thumbnail (360x540) via Plex photo transcode
    transcode_url = (
        f"{plex_url}/photo/:/transcode"
        f"?width=360&height=540&minSize=1&upscale=1"
        f"&url={thumb}&X-Plex-Token={token}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(transcode_url)
            # If transcode failed, fallback to direct thumbnail URL
            if res.status_code != 200:
                direct_url = f"{plex_url}{thumb}?X-Plex-Token={token}"
                res = await client.get(direct_url)

            if res.status_code == 200:
                content = res.content
                content_type = res.headers.get("content-type", "image/jpeg")

                # Evict oldest if cache limit reached
                if len(_poster_cache) >= MAX_CACHE_ITEMS:
                    first_key = next(iter(_poster_cache))
                    del _poster_cache[first_key]
                _poster_cache[thumb] = (content, content_type)

                return Response(
                    content=content,
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=604800, immutable",
                        "X-Cache": "MISS"
                    }
                )
            else:
                logger.warning(f"Failed to fetch Plex poster for {thumb}: {res.status_code}")
                raise HTTPException(status_code=res.status_code, detail="Poster not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error proxying Plex poster {thumb}: {e}")
        raise HTTPException(status_code=502, detail="Error fetching poster from Plex")
