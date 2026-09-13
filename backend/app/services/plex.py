import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from plexapi.server import PlexServer
from plexapi.exceptions import NotFound, Unauthorized
from ..config import settings
from ..models.db import is_whitelisted, is_recommended, get_all_recommendations

logger = logging.getLogger(__name__)

class PlexService:
    def __init__(self):
        self._server: Optional[PlexServer] = None

    def get_server(self) -> Optional[PlexServer]:
        if not settings.PLEX_URL or not settings.PLEX_TOKEN:
            return None
        if self._server is None:
            try:
                self._server = PlexServer(settings.PLEX_URL, settings.PLEX_TOKEN, timeout=15)
            except Exception as e:
                logger.error(f"Failed to connect to Plex Server at {settings.PLEX_URL}: {e}")
                return None
        return self._server

    def reload(self):
        self._server = None

    def _extract_external_ids(self, item) -> Tuple[Optional[int], Optional[int]]:
        """Extracts (tmdb_id, tvdb_id) from Plex item guids"""
        tmdb_id = None
        tvdb_id = None
        
        # Check guids attribute
        guids = getattr(item, 'guids', []) or []
        for g in guids:
            guid_str = str(getattr(g, 'id', ''))
            if guid_str.startswith('tmdb://'):
                try:
                    tmdb_id = int(guid_str.split('://')[1])
                except (ValueError, IndexError):
                    pass
            elif guid_str.startswith('tvdb://'):
                try:
                    tvdb_id = int(guid_str.split('://')[1])
                except (ValueError, IndexError):
                    pass

        # Also check top-level guid if legacy agent
        top_guid = str(getattr(item, 'guid', ''))
        if not tmdb_id and 'themoviedb://' in top_guid:
            match = re.search(r'themoviedb://(\d+)', top_guid)
            if match:
                tmdb_id = int(match.group(1))
        if not tvdb_id and 'thetvdb://' in top_guid:
            match = re.search(r'thetvdb://(\d+)', top_guid)
            if match:
                tvdb_id = int(match.group(1))

        return tmdb_id, tvdb_id

    def get_all_movies(self) -> List[Dict[str, Any]]:
        server = self.get_server()
        if not server:
            return []

        movies = []
        for lib_name in settings.movie_libraries_list:
            try:
                section = server.library.section(lib_name)
                for item in section.all():
                    tmdb_id, tvdb_id = self._extract_external_ids(item)
                    
                    # Calculate file size
                    size_bytes = 0
                    for media in getattr(item, 'media', []):
                        for part in getattr(media, 'parts', []):
                            size_bytes += getattr(part, 'size', 0)

                    thumb = item.thumbUrl if hasattr(item, 'thumbUrl') else ""
                    last_viewed = getattr(item, 'lastViewedAt', None)
                    view_count = getattr(item, 'viewCount', 0) or 0
                    added_at = getattr(item, 'addedAt', None)

                    # Days unwatched calculation:
                    # If watched, days since last watch. If never watched, days since added to library!
                    ref_date = last_viewed if last_viewed else added_at
                    days_unwatched = 0
                    if ref_date:
                        days_unwatched = (datetime.utcnow() - ref_date).days

                    movies.append({
                        "rating_key": str(item.ratingKey),
                        "media_type": "movie",
                        "title": item.title,
                        "year": getattr(item, 'year', None),
                        "summary": getattr(item, 'summary', ""),
                        "thumb": thumb,
                        "size_bytes": size_bytes,
                        "view_count": view_count,
                        "last_viewed_at": last_viewed.isoformat() if last_viewed else None,
                        "added_at": added_at.isoformat() if added_at else None,
                        "days_unwatched": days_unwatched,
                        "tmdb_id": tmdb_id,
                        "tvdb_id": tvdb_id,
                        "is_whitelisted": is_whitelisted(str(item.ratingKey)),
                        "is_recommended": is_recommended(str(item.ratingKey)),
                    })
            except NotFound:
                logger.warning(f"Movie library section '{lib_name}' not found on Plex")
            except Exception as e:
                logger.error(f"Error fetching movies from '{lib_name}': {e}")

        return movies

    def get_all_shows(self) -> List[Dict[str, Any]]:
        server = self.get_server()
        if not server:
            return []

        shows = []
        for lib_name in settings.tv_libraries_list:
            try:
                section = server.library.section(lib_name)
                for item in section.all():
                    tmdb_id, tvdb_id = self._extract_external_ids(item)

                    size_bytes = 0
                    for episode in item.episodes():
                        for media in getattr(episode, 'media', []):
                            for part in getattr(media, 'parts', []):
                                size_bytes += getattr(part, 'size', 0)

                    thumb = item.thumbUrl if hasattr(item, 'thumbUrl') else ""
                    last_viewed = getattr(item, 'lastViewedAt', None)
                    view_count = getattr(item, 'viewedLeafCount', 0) or 0
                    added_at = getattr(item, 'addedAt', None)

                    ref_date = last_viewed if last_viewed else added_at
                    days_unwatched = 0
                    if ref_date:
                        days_unwatched = (datetime.utcnow() - ref_date).days

                    shows.append({
                        "rating_key": str(item.ratingKey),
                        "media_type": "show",
                        "title": item.title,
                        "year": getattr(item, 'year', None),
                        "summary": getattr(item, 'summary', ""),
                        "thumb": thumb,
                        "size_bytes": size_bytes,
                        "view_count": view_count,
                        "last_viewed_at": last_viewed.isoformat() if last_viewed else None,
                        "added_at": added_at.isoformat() if added_at else None,
                        "days_unwatched": days_unwatched,
                        "tmdb_id": tmdb_id,
                        "tvdb_id": tvdb_id,
                        "is_whitelisted": is_whitelisted(str(item.ratingKey)),
                        "is_recommended": is_recommended(str(item.ratingKey)),
                    })
            except NotFound:
                logger.warning(f"TV library section '{lib_name}' not found on Plex")
            except Exception as e:
                logger.error(f"Error fetching TV shows from '{lib_name}': {e}")

        return shows

    def set_collection_promotion(self, collection, home: bool = True, shared: bool = True, recommended: bool = True):
        """Configures visibility/promotion of collection to Home and Recommended tabs"""
        try:
            server = self.get_server()
            if not server:
                return

            # Call Plex collection prefs endpoint directly for rock-solid TV app home promotion
            url = f"{server._baseurl}/library/collections/{collection.ratingKey}/prefs"
            params = {
                "promotedToRecommended": "1" if recommended else "0",
                "promotedToOwnHome": "1" if home else "0",
                "promotedToSharedHome": "1" if shared else "0",
                "X-Plex-Token": settings.PLEX_TOKEN
            }
            server._session.put(url, params=params)
            logger.info(f"Updated promotion for collection '{collection.title}': home={home}, shared={shared}, rec={recommended}")
        except Exception as e:
            logger.error(f"Error promoting collection {collection.title}: {e}")

    def sync_leaving_collection(self, library_name: str, rating_keys: List[str], collection_title: str):
        """Updates the 'Leaving at the end of the month' collection with given rating keys"""
        server = self.get_server()
        if not server:
            return

        try:
            section = server.library.section(library_name)
            
            # Find or create collection
            collections = section.collections(title=collection_title)
            if collections:
                col = collections[0]
            else:
                if not rating_keys:
                    return  # Don't create empty collection
                first_item = section.fetchItem(int(rating_keys[0]))
                col = section.createCollection(title=collection_title, items=[first_item])
                rating_keys = rating_keys[1:]

            # If rating_keys is empty now, we can remove all or delete collection
            if not rating_keys and not col.children:
                logger.info(f"No items for '{collection_title}' in {library_name}")
                return

            # Sync items
            current_items = col.children
            current_keys = {str(it.ratingKey) for it in current_items}
            target_keys = set(rating_keys)

            # Items to add
            to_add_keys = target_keys - current_keys
            for key in to_add_keys:
                try:
                    item = section.fetchItem(int(key))
                    col.addItems([item])
                except Exception as e:
                    logger.warning(f"Could not add item {key} to {collection_title}: {e}")

            # Items to remove
            to_remove_keys = current_keys - target_keys
            for item in current_items:
                if str(item.ratingKey) in to_remove_keys:
                    try:
                        col.removeItems([item])
                    except Exception as e:
                        logger.warning(f"Could not remove item {item.ratingKey} from {collection_title}: {e}")

            # Promote to TV Home and Recommended
            self.set_collection_promotion(
                col,
                home=settings.PROMOTE_TO_HOME,
                shared=settings.PROMOTE_TO_SHARED,
                recommended=settings.PROMOTE_TO_RECOMMENDED
            )
        except Exception as e:
            logger.error(f"Error syncing leaving collection in {library_name}: {e}")

    def sync_recommendations_collection(self, library_name: str, media_type: str, collection_title: str):
        """
        Syncs curated favorites collection in the order of most recently favorited first!
        """
        server = self.get_server()
        if not server:
            return

        try:
            section = server.library.section(library_name)
            recs = get_all_recommendations(media_type=media_type) # already sorted by favorited_at DESC
            
            collections = section.collections(title=collection_title)
            col = collections[0] if collections else None

            if not recs:
                if col:
                    col.delete()
                    logger.info(f"Deleted empty recommendations collection '{collection_title}'")
                return

            # Fetch items in order
            ordered_items = []
            for r in recs:
                try:
                    item = section.fetchItem(int(r["rating_key"]))
                    ordered_items.append(item)
                except Exception:
                    pass

            if not ordered_items:
                return

            if not col:
                col = section.createCollection(title=collection_title, items=ordered_items)
            else:
                # Refresh items in collection to match order
                col.removeItems(col.children)
                col.addItems(ordered_items)

            # Ensure custom ordering mode
            try:
                col.sortUpdate(sort="custom")
            except Exception:
                pass

            # Promote to TV Home and Shared Home
            self.set_collection_promotion(
                col,
                home=True,
                shared=True,
                recommended=True
            )
            logger.info(f"Successfully updated '{collection_title}' with {len(ordered_items)} curated recommendations")
        except Exception as e:
            logger.error(f"Error syncing recommendations collection '{collection_title}': {e}")

plex_service = PlexService()
