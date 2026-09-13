import logging
from typing import Optional, Dict, Any
import httpx
from ..config import settings

logger = logging.getLogger(__name__)

class ArrClient:
    def __init__(self):
        self.radarr_url = (settings.RADARR_URL or "").rstrip("/")
        self.radarr_key = settings.RADARR_API_KEY
        self.sonarr_url = (settings.SONARR_URL or "").rstrip("/")
        self.sonarr_key = settings.SONARR_API_KEY

    @property
    def has_radarr(self) -> bool:
        return bool(self.radarr_url and self.radarr_key)

    @property
    def has_sonarr(self) -> bool:
        return bool(self.sonarr_url and self.sonarr_key)

    async def get_radarr_movie_by_tmdb(self, tmdb_id: int) -> Optional[Dict[str, Any]]:
        if not self.has_radarr or not tmdb_id:
            return None
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{self.radarr_url}/api/v3/movie",
                    headers={"X-Api-Key": self.radarr_key},
                    params={"tmdbId": tmdb_id}
                )
                if res.status_code == 200:
                    movies = res.json()
                    if movies:
                        return movies[0]
        except Exception as e:
            logger.warning(f"Failed to lookup Radarr movie for tmdb {tmdb_id}: {e}")
        return None

    async def get_sonarr_series_by_tvdb(self, tvdb_id: int) -> Optional[Dict[str, Any]]:
        if not self.has_sonarr or not tvdb_id:
            return None
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    f"{self.sonarr_url}/api/v3/series",
                    headers={"X-Api-Key": self.sonarr_key},
                    params={"tvdbId": tvdb_id}
                )
                if res.status_code == 200:
                    series = res.json()
                    if series:
                        return series[0]
        except Exception as e:
            logger.warning(f"Failed to lookup Sonarr series for tvdb {tvdb_id}: {e}")
        return None

    async def delete_movie(self, tmdb_id: int, dry_run: bool = True) -> bool:
        """Deletes movie file and unmonitors in Radarr"""
        if not self.has_radarr:
            logger.warning("Radarr is not configured, skipping deletion via Radarr")
            return False
            
        movie = await self.get_radarr_movie_by_tmdb(tmdb_id)
        if not movie:
            logger.warning(f"Movie with TMDB {tmdb_id} not found in Radarr")
            return False

        movie_id = movie.get("id")
        title = movie.get("title")

        if dry_run:
            logger.info(f"[DRY RUN] Would delete movie from Radarr: {title} (ID: {movie_id})")
            return True

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.delete(
                    f"{self.radarr_url}/api/v3/movie/{movie_id}",
                    headers={"X-Api-Key": self.radarr_key},
                    params={"deleteFiles": "true", "addImportExclusion": "false"}
                )
                if res.status_code in (200, 204):
                    logger.info(f"Successfully deleted {title} via Radarr")
                    return True
                else:
                    logger.error(f"Failed to delete {title} via Radarr: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Error calling Radarr delete for {title}: {e}")
        return False

    async def delete_series(self, tvdb_id: int, dry_run: bool = True) -> bool:
        """Deletes series files and unmonitors in Sonarr"""
        if not self.has_sonarr:
            logger.warning("Sonarr is not configured, skipping deletion via Sonarr")
            return False
            
        series = await self.get_sonarr_series_by_tvdb(tvdb_id)
        if not series:
            logger.warning(f"Series with TVDB {tvdb_id} not found in Sonarr")
            return False

        series_id = series.get("id")
        title = series.get("title")

        if dry_run:
            logger.info(f"[DRY RUN] Would delete series from Sonarr: {title} (ID: {series_id})")
            return True

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.delete(
                    f"{self.sonarr_url}/api/v3/series/{series_id}",
                    headers={"X-Api-Key": self.sonarr_key},
                    params={"deleteFiles": "true", "addImportListExclusion": "false"}
                )
                if res.status_code in (200, 204):
                    logger.info(f"Successfully deleted {title} via Sonarr")
                    return True
                else:
                    logger.error(f"Failed to delete {title} via Sonarr: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Error calling Sonarr delete for {title}: {e}")
        return False

arr_client = ArrClient()
