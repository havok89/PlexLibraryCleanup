import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Depends
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

class BulkWhitelistRequest(BaseModel):
    media_type: str = "movie"  # "movie", "show", "all"
    scope: str = "all_my_additions"  # "non_seerr" or "all_my_additions"

class StageRequest(BaseModel):
    media_type: str = "movie"
    title: str
    year: Optional[int] = None
    size_bytes: Optional[int] = 0
    requester_name: Optional[str] = None
    requester_avatar: Optional[str] = None

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
    selected_movie_libraries: Optional[List[str]] = None
    selected_tv_libraries: Optional[List[str]] = None
    discord_webhook_url: Optional[str] = None
    dynamic_leaving_title: Optional[bool] = None
    track_watch_all_users: Optional[bool] = None

class ShelfVisibilityRequest(BaseModel):
    library_name: str
    identifier: str
    home: Optional[bool] = None
    shared: Optional[bool] = None
    recommended: Optional[bool] = None

class ShelfReorderRequest(BaseModel):
    library_name: str
    identifiers: List[str]

class ShelfAutoOptimizeRequest(BaseModel):
    library_name: Optional[str] = "all"

@router.get("/media")
async def get_media(type: str = Query("movie", pattern="^(movie|show)$"), refresh: bool = Query(False)):
    try:
        items = await sync_engine.get_enriched_media(type, force_refresh=refresh)
        return items
    except Exception as e:
        logger.error(f"Error getting media: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/media/bulk-whitelist")
async def bulk_whitelist(payload: BulkWhitelistRequest):
    try:
        result = await sync_engine.bulk_whitelist_user_media(
            media_type=payload.media_type,
            scope=payload.scope
        )
        return result
    except Exception as e:
        logger.error(f"Error in bulk whitelist: {e}")
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
    sync_engine.update_cached_item(rating_key, payload.media_type, is_whitelisted=new_state, is_staged=False if new_state else False)
    
    # Immediately sync Plex Leaving Collection so Plex updates in real time
    try:
        libs = plex_service.get_movie_libraries() if payload.media_type == "movie" else plex_service.get_tv_libraries()
        cached_items = await sync_engine.get_enriched_media(payload.media_type, force_refresh=False)
        leaving_keys = [str(it["rating_key"]) for it in cached_items if it.get("is_staged")]
        for lib in libs:
            plex_service.sync_leaving_collection(lib, leaving_keys)
    except Exception as e:
        logger.warning(f"Failed to sync leaving collection after whitelist toggle: {e}")

    return {"rating_key": rating_key, "is_whitelisted": new_state}

@router.post("/media/{rating_key}/stage")
async def toggle_item_stage(rating_key: str, payload: StageRequest):
    try:
        result = await sync_engine.toggle_stage_item(
            rating_key=rating_key,
            media_type=payload.media_type,
            title=payload.title,
            year=payload.year,
            size_bytes=payload.size_bytes or 0,
            requester_name=payload.requester_name,
            requester_avatar=payload.requester_avatar
        )
        return result
    except Exception as e:
        logger.error(f"Error toggling stage for item {rating_key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    target_libs = plex_service.get_movie_libraries() if payload.media_type == "movie" else plex_service.get_tv_libraries()
    col_name = settings.RECOMMENDED_MOVIES_COLLECTION if payload.media_type == "movie" else settings.RECOMMENDED_SHOWS_COLLECTION
    for lib in target_libs:
        plex_service.sync_recommendations_collection(lib, payload.media_type, col_name)

    sync_engine.update_cached_item(rating_key, payload.media_type, is_recommended=new_state)
    return {"rating_key": rating_key, "is_recommended": new_state}

@router.post("/media/{rating_key}/delete")
async def delete_item_now(rating_key: str, media_type: str = Query("movie", pattern="^(movie|show)$")):
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

    if success and not dry_run:
        sync_engine.remove_cached_item(rating_key, media_type)

    return {
        "success": success,
        "rating_key": rating_key,
        "title": target["title"],
        "dry_run": dry_run
    }

@router.get("/recommendations")
async def list_recommendations(media_type: Optional[str] = None):
    recs = get_all_recommendations(media_type)
    for r in recs:
        p_url = r.get("poster_url", "")
        if p_url:
            if "/library/metadata/" in p_url:
                idx = p_url.find("/library/metadata/")
                clean_path = p_url[idx:].split("?")[0]
                r["poster_url"] = f"/api/poster?thumb={clean_path}"
            elif not p_url.startswith("/api/poster") and not p_url.startswith("http"):
                r["poster_url"] = f"/api/poster?thumb={p_url}"
    return recs

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
    avail_libs = plex_service.get_available_libraries()
    server = plex_service.get_server()
    return {
        "plex": {
            "url": settings.PLEX_URL,
            "connected": server is not None,
            "server_name": getattr(server, "friendlyName", None) if server else None,
            "available_movie_libraries": avail_libs["movies"],
            "available_tv_libraries": avail_libs["shows"],
            "movie_libraries": plex_service.get_movie_libraries(),
            "tv_libraries": plex_service.get_tv_libraries(),
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
            "webhook_url": discord_notifier.webhook_url,
            "configured": discord_notifier.is_configured
        },
        "movies_cleanup_enabled": sync_engine.is_movie_cleanup_enabled(),
        "tv_cleanup_enabled": sync_engine.is_tv_cleanup_enabled(),
        "default_unwatched_months_movies": sync_engine.get_unwatched_months_threshold("movie"),
        "default_unwatched_months_shows": sync_engine.get_unwatched_months_threshold("show"),
        "dry_run": (get_dynamic_setting("DRY_RUN", "true").lower() == "true") if get_dynamic_setting("DRY_RUN") is not None else settings.DRY_RUN,
        "leaving_collection_name": settings.LEAVING_COLLECTION_NAME,
        "dynamic_leaving_title": (get_dynamic_setting("DYNAMIC_LEAVING_TITLE", "true").lower() == "true") if get_dynamic_setting("DYNAMIC_LEAVING_TITLE") is not None else True,
        "current_leaving_collection_title": plex_service.get_leaving_collection_title(),
        "track_watch_all_users": (get_dynamic_setting("TRACK_WATCH_ALL_USERS", "true").lower() == "true") if get_dynamic_setting("TRACK_WATCH_ALL_USERS") is not None else settings.TRACK_WATCH_ALL_USERS,
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
    if payload.selected_movie_libraries is not None:
        set_dynamic_setting("SELECTED_MOVIE_LIBRARIES", ",".join(payload.selected_movie_libraries))
    if payload.selected_tv_libraries is not None:
        set_dynamic_setting("SELECTED_TV_LIBRARIES", ",".join(payload.selected_tv_libraries))
    if payload.discord_webhook_url is not None:
        set_dynamic_setting("DISCORD_WEBHOOK_URL", payload.discord_webhook_url.strip())
    if payload.dynamic_leaving_title is not None:
        set_dynamic_setting("DYNAMIC_LEAVING_TITLE", str(payload.dynamic_leaving_title))
    if payload.track_watch_all_users is not None:
        set_dynamic_setting("TRACK_WATCH_ALL_USERS", str(payload.track_watch_all_users))
        sync_engine.invalidate_cache()

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

@router.get("/shelves")
async def get_shelves():
    try:
        return plex_service.get_all_shelves()
    except Exception as e:
        logger.error(f"Error fetching shelves: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/shelves/visibility")
async def set_shelf_visibility(payload: ShelfVisibilityRequest):
    try:
        success = plex_service.update_shelf_visibility(
            library_name=payload.library_name,
            identifier=payload.identifier,
            home=payload.home,
            shared=payload.shared,
            recommended=payload.recommended,
        )
        if not success:
            raise HTTPException(status_code=400, detail="Failed to update shelf visibility")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating shelf visibility: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/shelves/reorder")
async def reorder_shelves(payload: ShelfReorderRequest):
    try:
        success = plex_service.reorder_library_shelves(
            library_name=payload.library_name,
            identifiers=payload.identifiers,
        )
        if not success:
            raise HTTPException(status_code=400, detail="Failed to reorder shelves")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reordering shelves: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/shelves/auto-optimize")
async def auto_optimize_shelves(payload: Optional[ShelfAutoOptimizeRequest] = None):
    try:
        lib = payload.library_name if payload else "all"
        all_sections = []
        for name in plex_service.get_movie_libraries() + plex_service.get_tv_libraries():
            if name and name not in all_sections:
                all_sections.append(name)

        if lib and lib != "all":
            plex_service.reorder_managed_hubs(lib)
        else:
            for sec_name in all_sections:
                plex_service.reorder_managed_hubs(sec_name)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error auto-optimizing shelves: {e}")
        raise HTTPException(status_code=500, detail=str(e))

