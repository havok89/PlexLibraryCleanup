import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..config import settings
from ..services.sync_engine import sync_engine
from ..services.plex import plex_service
from ..services.seerr import seerr_client
from ..services.arr import arr_client
from ..services.discord import discord_notifier
from .deps import get_current_user
from ..models.db import (
    add_to_whitelist,
    remove_from_whitelist,
    is_whitelisted,
    toggle_recommendation,
    is_recommended,
    get_all_recommendations,
    get_all_whitelist,
    get_dynamic_setting,
    set_dynamic_setting
)

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(get_current_user)])

class WhitelistRequest(BaseModel):
    media_type: str
    title: str
    year: Optional[int] = None
    reason: Optional[str] = ""

class RecommendRequest(BaseModel):
    media_type: str
    title: str
    year: Optional[int] = None
    poster_url: Optional[str] = ""

class SettingsUpdate(BaseModel):
    movies_cleanup_enabled: Optional[bool] = None
    tv_cleanup_enabled: Optional[bool] = None
    default_unwatched_months_movies: Optional[int] = None
    default_unwatched_months_shows: Optional[int] = None
    dry_run: Optional[bool] = None

@router.get("/media")
async def get_media(type: str = Query("movie", regex="^(movie|show)$")):
    try:
        items = await sync_engine.get_enriched_media(type)
        return items
    except Exception as e:
        logger.error(f"Error getting media: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/media/{rating_key}/whitelist")
async def toggle_item_whitelist(rating_key: str, payload: WhitelistRequest):
    whitelisted = is_whitelisted(rating_key)
    if whitelisted:
        remove_from_whitelist(rating_key)
        new_state = False
    else:
        add_to_whitelist(rating_key, payload.media_type, payload.title, payload.year, payload.reason or "")
        new_state = True
    return {"rating_key": rating_key, "is_whitelisted": new_state}

@router.post("/media/{rating_key}/recommend")
async def toggle_item_recommendation(rating_key: str, payload: RecommendRequest):
    new_state = toggle_recommendation(
        rating_key=rating_key,
        media_type=payload.media_type,
        title=payload.title,
        year=payload.year,
        poster_url=payload.poster_url or ""
    )

    # Immediately sync collection order on Plex
    target_libs = settings.movie_libraries_list if payload.media_type == "movie" else settings.tv_libraries_list
    col_name = settings.RECOMMENDED_MOVIES_COLLECTION if payload.media_type == "movie" else settings.RECOMMENDED_SHOWS_COLLECTION
    for lib in target_libs:
        plex_service.sync_recommendations_collection(lib, payload.media_type, col_name)

    return {"rating_key": rating_key, "is_recommended": new_state}

@router.post("/media/{rating_key}/delete")
async def delete_item_now(rating_key: str, media_type: str = Query("movie", regex="^(movie|show)$")):
    dyn_dry = get_dynamic_setting("DRY_RUN")
    dry_run = (dyn_dry.lower() == "true") if dyn_dry is not None else settings.DRY_RUN

    # Get media details to extract tmdb/tvdb id
    items = await sync_engine.get_enriched_media(media_type)
    target = next((it for it in items if it["rating_key"] == rating_key), None)
    if not target:
        raise HTTPException(status_code=404, detail="Media item not found")

    success = False
    if media_type == "movie" and target.get("tmdb_id"):
        success = await arr_client.delete_movie(target["tmdb_id"], dry_run=dry_run)
    elif media_type == "show" and target.get("tvdb_id"):
        success = await arr_client.delete_series(target["tvdb_id"], dry_run=dry_run)
    else:
        raise HTTPException(status_code=400, detail="Missing external TMDB/TVDB ID for deletion via Radarr/Sonarr")

    return {
        "success": success,
        "rating_key": rating_key,
        "title": target["title"],
        "dry_run": dry_run
    }

@router.get("/recommendations")
async def list_recommendations(media_type: Optional[str] = None):
    return get_all_recommendations(media_type)

@router.get("/whitelist")
async def list_whitelist():
    return get_all_whitelist()

@router.get("/stats")
async def get_dashboard_stats():
    movies = await sync_engine.get_enriched_media("movie")
    shows = await sync_engine.get_enriched_media("show")

    m_thresh_days = sync_engine.get_unwatched_months_threshold("movie") * 30
    s_thresh_days = sync_engine.get_unwatched_months_threshold("show") * 30

    unwatched_movies = [m for m in movies if not m["is_whitelisted"] and m["days_unwatched"] >= m_thresh_days]
    unwatched_shows = [s for s in shows if not s["is_whitelisted"] and s["days_unwatched"] >= s_thresh_days]

    reclaimable_bytes = sum(m.get("size_bytes", 0) for m in unwatched_movies) + sum(s.get("size_bytes", 0) for s in unwatched_shows)

    return {
        "total_movies": len(movies),
        "total_shows": len(shows),
        "unwatched_movies_count": len(unwatched_movies),
        "unwatched_shows_count": len(unwatched_shows),
        "reclaimable_gb": round(reclaimable_bytes / (1024 ** 3), 2),
        "movies_cleanup_enabled": sync_engine.is_movie_cleanup_enabled(),
        "tv_cleanup_enabled": sync_engine.is_tv_cleanup_enabled(),
        "dry_run": (get_dynamic_setting("DRY_RUN", "true").lower() == "true")
    }

@router.get("/settings")
async def get_current_settings():
    return {
        "plex": {
            "url": settings.PLEX_URL,
            "connected": plex_service.get_server() is not None,
            "movie_libraries": settings.movie_libraries_list,
            "tv_libraries": settings.tv_libraries_list,
        },
        "seerr": {
            "url": settings.OVERSEERR_URL,
            "configured": seerr_client.is_configured
        },
        "radarr": {
            "url": settings.RADARR_URL,
            "configured": arr_client.has_radarr
        },
        "sonarr": {
            "url": settings.SONARR_URL,
            "configured": arr_client.has_sonarr
        },
        "discord": {
            "configured": discord_notifier.is_configured
        },
        "movies_cleanup_enabled": sync_engine.is_movie_cleanup_enabled(),
        "tv_cleanup_enabled": sync_engine.is_tv_cleanup_enabled(),
        "default_unwatched_months_movies": sync_engine.get_unwatched_months_threshold("movie"),
        "default_unwatched_months_shows": sync_engine.get_unwatched_months_threshold("show"),
        "dry_run": (get_dynamic_setting("DRY_RUN", "true").lower() == "true") if get_dynamic_setting("DRY_RUN") is not None else settings.DRY_RUN,
        "leaving_collection_name": settings.LEAVING_COLLECTION_NAME,
        "recommended_movies_collection": settings.RECOMMENDED_MOVIES_COLLECTION,
        "recommended_shows_collection": settings.RECOMMENDED_SHOWS_COLLECTION,
    }

@router.post("/settings")
async def update_settings(payload: SettingsUpdate):
    if payload.movies_cleanup_enabled is not None:
        set_dynamic_setting("MOVIES_CLEANUP_ENABLED", str(payload.movies_cleanup_enabled))
    if payload.tv_cleanup_enabled is not None:
        set_dynamic_setting("TV_CLEANUP_ENABLED", str(payload.tv_cleanup_enabled))
    if payload.default_unwatched_months_movies is not None:
        set_dynamic_setting("DEFAULT_UNWATCHED_MONTHS_MOVIES", str(payload.default_unwatched_months_movies))
    if payload.default_unwatched_months_shows is not None:
        set_dynamic_setting("DEFAULT_UNWATCHED_MONTHS_SHOWS", str(payload.default_unwatched_months_shows))
    if payload.dry_run is not None:
        set_dynamic_setting("DRY_RUN", str(payload.dry_run))

    return {"status": "saved"}

@router.post("/sync")
async def trigger_manual_sync():
    result = await sync_engine.run_full_sync()
    return {"status": "success", "result": result}

@router.post("/test-discord")
async def test_discord():
    if not discord_notifier.is_configured:
        raise HTTPException(status_code=400, detail="Discord webhook URL is not configured")
    success = await discord_notifier.send_embed(
        title="🔔 Test Notification from Plex Library Cleaner",
        description="Your Discord notifications are correctly hooked up and working!",
        color=0x2ECC71
    )
    return {"success": success}
