import logging
import calendar
import time
import asyncio
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Tuple, Optional
from ..config import settings
from .plex import plex_service
from .seerr import seerr_client
from .arr import arr_client
from .discord import discord_notifier
from ..models.db import (
    get_db,
    is_whitelisted,
    bulk_add_to_whitelist,
    is_staged_in_db,
    stage_item,
    unstage_item,
    get_dynamic_setting,
    set_dynamic_setting,
    get_all_recommendations
)

logger = logging.getLogger(__name__)

def get_end_of_month_date() -> datetime:
    """Calculates the last second of the current month"""
    today = date.today()
    _, last_day = calendar.monthrange(today.year, today.month)
    return datetime(today.year, today.month, last_day, 23, 59, 59)

class SyncEngine:
    def __init__(self):
        self._media_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
        self.CACHE_TTL = 3600  # 1 hour TTL (updated in-place on mutations)

    def invalidate_cache(self, media_type: Optional[str] = None):
        """Invalidates in-memory media cache"""
        if media_type:
            self._media_cache.pop(media_type, None)
        else:
            self._media_cache.clear()
        logger.info(f"Invalidated media cache (target: {media_type or 'all'})")

    def update_cached_item(self, rating_key: str, media_type: str, **kwargs):
        """Updates a single cached item's attributes in memory instantly"""
        if media_type in self._media_cache:
            ts, items = self._media_cache[media_type]
            for it in items:
                if str(it.get("rating_key")) == str(rating_key):
                    for k, v in kwargs.items():
                        it[k] = v
                    break

    def remove_cached_item(self, rating_key: str, media_type: str):
        """Removes a deleted item from the cache"""
        if media_type in self._media_cache:
            ts, items = self._media_cache[media_type]
            self._media_cache[media_type] = (ts, [it for it in items if str(it.get("rating_key")) != str(rating_key)])

    def update_cached_bulk_whitelist(self, media_type: str, scope: str):
        """Updates whitelist status in cache for all matching items without refetching"""
        types = ["movie", "show"] if media_type == "all" else [media_type]
        for m_type in types:
            if m_type in self._media_cache:
                ts, items = self._media_cache[m_type]
                for it in items:
                    if scope == "non_seerr":
                        if it.get("requester_name") is None:
                            it["is_whitelisted"] = True
                            it["is_staged"] = False
                    else:  # all_my_additions
                        if not it.get("requested_by_other"):
                            it["is_whitelisted"] = True
                            it["is_staged"] = False

    async def get_enriched_media(self, media_type: str = "movie", force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Fetches all items from Plex, enriched with Overseerr requests and whitelist/recommendation state.
        Uses in-memory caching with 10-minute TTL to ensure instant page refreshes.
        """
        now = time.time()
        if not force_refresh and media_type in self._media_cache:
            cached_time, cached_items = self._media_cache[media_type]
            if now - cached_time < self.CACHE_TTL:
                return cached_items
        if media_type == "movie":
            items = plex_service.get_all_movies()
        else:
            items = plex_service.get_all_shows()

        # Fetch Seerr requests map
        requests_map = await seerr_client.get_requests_map()

        # Query staged items from database
        staged_keys = set()
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT rating_key FROM scheduled_items WHERE status = 'staged'")
                staged_keys = {str(row[0]) for row in cursor.fetchall()}
        except Exception as e:
            logger.warning(f"Error checking staged items: {e}")

        threshold_days = self.get_unwatched_months_threshold(media_type) * 30
        is_cleanup_active = self.is_movie_cleanup_enabled() if media_type == "movie" else self.is_tv_cleanup_enabled()

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

            # Item is staged for cleanup if not whitelisted and (staged in DB or meets leaving threshold)
            # Staged items remain staged through the countdown period (last chance to watch)
            is_staged_in_table = str(it.get("rating_key")) in staged_keys

            it["is_staged"] = (not it.get("is_whitelisted")) and (
                is_staged_in_table or (
                    is_cleanup_active and (it.get("days_unwatched", 0) >= threshold_days)
                )
            )

        self._media_cache[media_type] = (now, items)
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
        # Invalidate in-memory cache to ensure fresh evaluation
        self.invalidate_cache()
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

        # 0. Execute due deletions from previous month if deadline has passed
        now = datetime.utcnow()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT rating_key, media_type, title, year, size_bytes 
                FROM scheduled_items 
                WHERE status = 'staged' AND scheduled_delete_at < ?
            """, (now,))
            due_items = [dict(row) for row in cursor.fetchall()]

        if due_items:
            logger.info(f"Processing {len(due_items)} items due for deletion (scheduled_delete_at < {now}, dry_run={dry_run})")
            movie_map = {str(m["rating_key"]): m for m in await self.get_enriched_media("movie")}
            show_map = {str(s["rating_key"]): s for s in await self.get_enriched_media("show")}
            deleted_items_list = []

            for item in due_items:
                rk = str(item["rating_key"])
                m_type = item["media_type"]
                media_info = movie_map.get(rk) if m_type == "movie" else show_map.get(rk)

                deleted = False
                if m_type == "movie":
                    tmdb_id = media_info.get("tmdb_id") if media_info else None
                    if tmdb_id:
                        deleted = await arr_client.delete_movie(tmdb_id, dry_run=dry_run)
                else:
                    tvdb_id = media_info.get("tvdb_id") if media_info else None
                    if tvdb_id:
                        deleted = await arr_client.delete_series(tvdb_id, dry_run=dry_run)

                if deleted:
                    summary["deleted_count"] += 1
                    reclaimed = (item.get("size_bytes") or 0)
                    summary["reclaimed_bytes"] += reclaimed
                    deleted_items_list.append({
                        "title": item.get("title", "Unknown"),
                        "year": item.get("year"),
                        "media_type": m_type,
                        "size_bytes": reclaimed
                    })
                    if not dry_run:
                        with get_db() as conn:
                            cursor = conn.cursor()
                            cursor.execute("UPDATE scheduled_items SET status = 'deleted' WHERE rating_key = ?", (rk,))
                            conn.commit()
                        self.remove_cached_item(rk, m_type)

                # Throttle deletions (500ms) to ensure smooth disk I/O and zero rate limit issues
                await asyncio.sleep(0.5)

            if summary["deleted_count"] > 0:
                logger.info(f"Month-end cleanup processed {summary['deleted_count']} items (reclaimed {summary['reclaimed_bytes'] / (1024**3):.2f} GB, dry_run={dry_run})")
                if settings.DISCORD_NOTIFY_ON_DELETE:
                    await discord_notifier.notify_cleanup_completed(
                        summary["deleted_count"],
                        summary["reclaimed_bytes"],
                        deleted_items=deleted_items_list,
                        dry_run=dry_run
                    )

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

            # Sync Plex Collection with dynamic countdown title
            dynamic_leaving_title = plex_service.get_leaving_collection_title()
            for lib in plex_service.get_movie_libraries():
                plex_service.sync_leaving_collection(lib, leaving_movie_keys, dynamic_leaving_title)

            # Notify Discord of newly staged
            if newly_staged_movies and settings.DISCORD_NOTIFY_ON_ADD:
                await discord_notifier.notify_leaving_soon_added(newly_staged_movies, target_date_str, dynamic_leaving_title)

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

            dynamic_leaving_title = plex_service.get_leaving_collection_title()
            for lib in plex_service.get_tv_libraries():
                plex_service.sync_leaving_collection(lib, leaving_show_keys, dynamic_leaving_title)

            if newly_staged_shows and settings.DISCORD_NOTIFY_ON_ADD:
                await discord_notifier.notify_leaving_soon_added(newly_staged_shows, target_date_str, dynamic_leaving_title)

        # 3. Always sync Curated Recommendations
        for lib in plex_service.get_movie_libraries():
            plex_service.sync_recommendations_collection(lib, "movie", settings.RECOMMENDED_MOVIES_COLLECTION)
        for lib in plex_service.get_tv_libraries():
            plex_service.sync_recommendations_collection(lib, "show", settings.RECOMMENDED_SHOWS_COLLECTION)

        # 4. Check if any currently staged items were watched since last check
        await self.check_and_notify_staged_watches()

        return summary

    async def check_and_notify_staged_watches(self):
        """
        Checks if any item currently staged on the Leaving Soon shelf was watched
        since the last check (or in the last 24h). Sends a single Discord notification
        listing what was watched and by whom.
        If nothing was watched, remains completely silent.
        """
        try:
            # Query all currently staged items
            staged_map = {}
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT rating_key, media_type, title, year FROM scheduled_items WHERE status = 'staged'")
                for row in cursor.fetchall():
                    staged_map[str(row["rating_key"])] = dict(row)

            if not staged_map:
                return

            server = plex_service.get_server()
            if not server:
                return

            # Determine cutoff timestamp: since last check or last 24 hours
            last_check_str = get_dynamic_setting("LAST_STAGED_WATCH_CHECK")
            now = datetime.utcnow()
            if last_check_str:
                try:
                    cutoff_time = datetime.fromisoformat(last_check_str)
                except Exception:
                    cutoff_time = now - timedelta(hours=24)
            else:
                cutoff_time = now - timedelta(hours=24)

            # Update timestamp immediately for next run
            set_dynamic_setting("LAST_STAGED_WATCH_CHECK", now.isoformat())

            # Load recent history (up to 500 plays)
            history = server.history(maxresults=500)
            user_names = plex_service.get_user_names()

            watched_events = []
            seen_keys = set()
            for h in history:
                va = getattr(h, "viewedAt", None)
                if not va or va <= cutoff_time:
                    continue

                rk = str(getattr(h, "ratingKey", ""))
                gp_key = getattr(h, "grandparentKey", None)
                show_rk = gp_key.split("/")[-1] if gp_key else None

                target_key = None
                if rk in staged_map:
                    target_key = rk
                elif show_rk and show_rk in staged_map:
                    target_key = show_rk

                if target_key and target_key not in seen_keys:
                    seen_keys.add(target_key)
                    item_info = staged_map[target_key]
                    acc_id = getattr(h, "accountID", None)
                    user_name = user_names.get(acc_id, f"User {acc_id}" if acc_id else "Someone")
                    watched_events.append({
                        "rating_key": target_key,
                        "title": item_info.get("title"),
                        "year": item_info.get("year"),
                        "media_type": item_info.get("media_type"),
                        "user_name": user_name,
                        "viewed_at": va
                    })

            if watched_events:
                logger.info(f"Found {len(watched_events)} staged items watched in last 24h: {[e['title'] for e in watched_events]}")
                await discord_notifier.notify_staged_items_watched(watched_events)
            else:
                logger.info("No staged items were watched since last check. (Discord notification suppressed)")
        except Exception as e:
            logger.warning(f"Error checking staged watch activity: {e}")

    async def bulk_whitelist_user_media(self, media_type: str = "movie", scope: str = "all_my_additions") -> Dict[str, Any]:
        """
        Marks items added directly by user (and optionally admin Overseerr requests) as Whitelisted.
        scope:
          - "all_my_additions": direct additions + admin Overseerr requests (items where requested_by_other is False)
          - "non_seerr": only direct additions (requester_name is None)
        Also removes matching items from scheduled_items, invalidates media cache,
        and re-syncs Plex leaving collections.
        """
        types_to_process = ["movie", "show"] if media_type == "all" else [media_type]
        total_whitelisted = 0
        details = {}

        for m_type in types_to_process:
            # Refresh media list to get current state
            items = await self.get_enriched_media(m_type, force_refresh=True)
            candidates = []
            for it in items:
                if it.get("is_whitelisted"):
                    continue
                if scope == "non_seerr":
                    if it.get("requester_name") is None:
                        candidates.append(it)
                else:  # all_my_additions
                    if not it.get("requested_by_other"):
                        candidates.append(it)

            if candidates:
                reason = "Direct addition (not in Seerr)" if scope == "non_seerr" else "Added by me / Admin request"
                added_count = bulk_add_to_whitelist(candidates, reason=reason)
                total_whitelisted += added_count
                details[m_type] = added_count
                logger.info(f"Bulk whitelisted {added_count} {m_type} items (scope: {scope})")
            else:
                details[m_type] = 0

        # Update in-memory cache directly
        self.update_cached_bulk_whitelist(media_type, scope)

        # Re-sync Plex leaving collection so protected items are removed immediately from Plex
        for m_type in types_to_process:
            libs = plex_service.get_movie_libraries() if m_type == "movie" else plex_service.get_tv_libraries()
            cached_items = await self.get_enriched_media(m_type, force_refresh=False)
            leaving_keys = [it["rating_key"] for it in cached_items if it.get("is_staged")]
            for lib in libs:
                plex_service.sync_leaving_collection(lib, leaving_keys, settings.LEAVING_COLLECTION_NAME)

        return {
            "success": True,
            "whitelisted_count": total_whitelisted,
            "details": details,
            "media_type": media_type,
            "scope": scope
        }

    async def toggle_stage_item(
        self,
        rating_key: str,
        media_type: str,
        title: str,
        year: Optional[int] = None,
        size_bytes: int = 0,
        requester_name: Optional[str] = None,
        requester_avatar: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Manually stages or unstages an item for end-of-month cleanup.
        - If staged: unstages and removes from Plex Leaving Soon collection.
        - If not staged: stages, removes from whitelist if kept, and adds to Plex Leaving Soon collection.
        """
        currently_staged = is_staged_in_db(rating_key)
        items = await self.get_enriched_media(media_type)
        target = next((it for it in items if str(it.get("rating_key")) == str(rating_key)), None)
        
        is_currently_staged = currently_staged or (target and target.get("is_staged", False))

        if is_currently_staged:
            unstage_item(rating_key)
            new_staged = False
            new_whitelisted = False
            if target and target.get("days_unwatched", 0) >= (self.get_unwatched_months_threshold(media_type) * 30):
                # Protect it with whitelist so it doesn't get automatically re-staged
                bulk_add_to_whitelist([target or {"rating_key": rating_key, "media_type": media_type, "title": title, "year": year}], reason="Manually unstaged from deletion")
                new_whitelisted = True
            elif target and target.get("is_whitelisted"):
                new_whitelisted = True
        else:
            end_of_month = get_end_of_month_date()
            stage_item(
                rating_key=rating_key,
                media_type=media_type,
                title=title,
                year=year,
                size_bytes=size_bytes,
                requester_name=requester_name,
                requester_avatar=requester_avatar,
                scheduled_delete_at=end_of_month
            )
            new_staged = True
            new_whitelisted = False

        # Update in-memory cache directly without requiring a 20s network re-query
        self.update_cached_item(rating_key, media_type, is_staged=new_staged, is_whitelisted=new_whitelisted)

        # Sync Plex Leaving Collection
        libs = plex_service.get_movie_libraries() if media_type == "movie" else plex_service.get_tv_libraries()
        cached_items = await self.get_enriched_media(media_type, force_refresh=False)
        leaving_keys = [str(it["rating_key"]) for it in cached_items if it.get("is_staged")]
        for lib in libs:
            plex_service.sync_leaving_collection(lib, leaving_keys, settings.LEAVING_COLLECTION_NAME)

        return {
            "rating_key": str(rating_key),
            "is_staged": new_staged,
            "is_whitelisted": new_whitelisted
        }

sync_engine = SyncEngine()
