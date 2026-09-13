import logging
import calendar
from datetime import datetime, date
from typing import List, Dict, Any, Tuple, Optional
from ..config import settings
from .plex import plex_service
from .seerr import seerr_client
from .arr import arr_client
from .discord import discord_notifier
from ..models.db import (
    get_db,
    is_whitelisted,
    get_dynamic_setting,
    get_all_recommendations
)

logger = logging.getLogger(__name__)

def get_end_of_month_date() -> datetime:
    """Calculates the last second of the current month"""
    today = date.today()
    _, last_day = calendar.monthrange(today.year, today.month)
    return datetime(today.year, today.month, last_day, 23, 59, 59)

class SyncEngine:
    async def get_enriched_media(self, media_type: str = "movie") -> List[Dict[str, Any]]:
        """
        Fetches all items from Plex, enriched with Overseerr requests and whitelist/recommendation state.
        """
        if media_type == "movie":
            items = plex_service.get_all_movies()
        else:
            items = plex_service.get_all_shows()

        # Fetch Seerr requests map
        requests_map = await seerr_client.get_requests_map()

        for it in items:
            tmdb_key = f"tmdb:{it.get('tmdb_id')}"
            tvdb_key = f"tvdb:{it.get('tvdb_id')}"
            
            req_info = requests_map.get(tmdb_key) or requests_map.get(tvdb_key)
            if req_info:
                it["requester_name"] = req_info.get("requested_by_name")
                it["requester_avatar"] = req_info.get("requested_by_avatar")
                it["is_admin_request"] = req_info.get("is_admin")
                it["requested_by_other"] = req_info.get("requested_by_other")
            else:
                it["requester_name"] = None
                it["requester_avatar"] = None
                it["is_admin_request"] = False
                it["requested_by_other"] = False

        return items

    def is_movie_cleanup_enabled(self) -> bool:
        dyn = get_dynamic_setting("MOVIES_CLEANUP_ENABLED")
        if dyn is not None:
            return dyn.lower() == "true"
        return settings.MOVIES_CLEANUP_ENABLED

    def is_tv_cleanup_enabled(self) -> bool:
        dyn = get_dynamic_setting("TV_CLEANUP_ENABLED")
        if dyn is not None:
            return dyn.lower() == "true"
        return settings.TV_CLEANUP_ENABLED

    def get_unwatched_months_threshold(self, media_type: str) -> int:
        key = f"DEFAULT_UNWATCHED_MONTHS_{'MOVIES' if media_type == 'movie' else 'SHOWS'}"
        dyn = get_dynamic_setting(key)
        if dyn is not None:
            try:
                return int(dyn)
            except ValueError:
                pass
        return settings.DEFAULT_UNWATCHED_MONTHS_MOVIES if media_type == "movie" else settings.DEFAULT_UNWATCHED_MONTHS_SHOWS

    async def run_full_sync(self, dry_run: Optional[bool] = None) -> Dict[str, Any]:
        """
        Runs the full cycle:
        1. Identify leaving candidates based on threshold & whitelist.
        2. Auto-remove items watched since being staged.
        3. Sync Plex 'Leaving at the end of the month' collections with TV Home promotion.
        4. Send Discord notifications if new items are staged.
        5. Execute month-end deletions if due.
        6. Sync curated recommendation collections.
        """
        if dry_run is None:
            dyn_dry = get_dynamic_setting("DRY_RUN")
            dry_run = (dyn_dry.lower() == "true") if dyn_dry is not None else settings.DRY_RUN

        target_deletion_date = get_end_of_month_date()
        target_date_str = target_deletion_date.strftime("%B %d, %Y")

        summary = {
            "movies_evaluated": 0,
            "shows_evaluated": 0,
            "movies_staged": 0,
            "shows_staged": 0,
            "saved_by_watch": 0,
            "deleted_count": 0,
            "reclaimed_bytes": 0,
            "dry_run": dry_run
        }

        # 1. Process Movies if enabled
        if self.is_movie_cleanup_enabled():
            movies = await self.get_enriched_media("movie")
            summary["movies_evaluated"] = len(movies)
            threshold_days = self.get_unwatched_months_threshold("movie") * 30

            leaving_movie_keys = []
            newly_staged_movies = []

            for m in movies:
                if m["is_whitelisted"]:
                    continue

                if m["days_unwatched"] >= threshold_days:
                    leaving_movie_keys.append(m["rating_key"])
                    
                    # Record in DB
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT 1 FROM scheduled_items WHERE rating_key = ?", (m["rating_key"],))
                        if not cursor.fetchone():
                            cursor.execute("""
                                INSERT INTO scheduled_items (rating_key, media_type, title, year, size_bytes, requester_name, requester_avatar, scheduled_delete_at, status)
                                VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, 'staged')
                            """, (m["rating_key"], m["title"], m.get("year"), m["size_bytes"], m.get("requester_name"), m.get("requester_avatar"), target_deletion_date))
                            conn.commit()
                            newly_staged_movies.append(m)

            summary["movies_staged"] = len(leaving_movie_keys)

            # Sync Plex Collection
            for lib in settings.movie_libraries_list:
                plex_service.sync_leaving_collection(lib, leaving_movie_keys, settings.LEAVING_COLLECTION_NAME)

            # Notify Discord of newly staged
            if newly_staged_movies and settings.DISCORD_NOTIFY_ON_ADD:
                await discord_notifier.notify_leaving_soon_added(newly_staged_movies, target_date_str)

        # 2. Process TV Shows if enabled
        if self.is_tv_cleanup_enabled():
            shows = await self.get_enriched_media("show")
            summary["shows_evaluated"] = len(shows)
            threshold_days = self.get_unwatched_months_threshold("show") * 30

            leaving_show_keys = []
            newly_staged_shows = []

            for s in shows:
                if s["is_whitelisted"]:
                    continue

                if s["days_unwatched"] >= threshold_days:
                    leaving_show_keys.append(s["rating_key"])
                    
                    with get_db() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT 1 FROM scheduled_items WHERE rating_key = ?", (s["rating_key"],))
                        if not cursor.fetchone():
                            cursor.execute("""
                                INSERT INTO scheduled_items (rating_key, media_type, title, year, size_bytes, requester_name, requester_avatar, scheduled_delete_at, status)
                                VALUES (?, 'show', ?, ?, ?, ?, ?, ?, 'staged')
                            """, (s["rating_key"], s["title"], s.get("year"), s["size_bytes"], s.get("requester_name"), s.get("requester_avatar"), target_deletion_date))
                            conn.commit()
                            newly_staged_shows.append(s)

            summary["shows_staged"] = len(leaving_show_keys)

            for lib in settings.tv_libraries_list:
                plex_service.sync_leaving_collection(lib, leaving_show_keys, settings.LEAVING_COLLECTION_NAME)

            if newly_staged_shows and settings.DISCORD_NOTIFY_ON_ADD:
                await discord_notifier.notify_leaving_soon_added(newly_staged_shows, target_date_str)

        # 3. Always sync Curated Recommendations
        for lib in settings.movie_libraries_list:
            plex_service.sync_recommendations_collection(lib, "movie", settings.RECOMMENDED_MOVIES_COLLECTION)
        for lib in settings.tv_libraries_list:
            plex_service.sync_recommendations_collection(lib, "show", settings.RECOMMENDED_SHOWS_COLLECTION)

        return summary

sync_engine = SyncEngine()
