import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 6064
    DATA_DIR: str = os.getenv("DATA_DIR", "./data")
    DRY_RUN: bool = True

    # Plex Auth & Security
    PLEX_AUTH_ENABLED: bool = True
    CLIENT_IDENTIFIER: str = os.getenv("CLIENT_IDENTIFIER", "plex-clean-curate-app-v1")
    SESSION_EXPIRY_DAYS: int = 30

    # Plex
    PLEX_URL: str = ""
    PLEX_TOKEN: str = ""
    PLEX_MOVIE_LIBRARIES: str = "Movies"
    PLEX_TV_LIBRARIES: str = "TV Shows"

    # Seerr (Overseerr / Jellyseerr)
    OVERSEERR_URL: str = ""
    OVERSEERR_API_KEY: str = ""

    # Radarr & Sonarr
    RADARR_URL: str = ""
    RADARR_API_KEY: str = ""
    SONARR_URL: str = ""
    SONARR_API_KEY: str = ""

    # Discord Webhook
    DISCORD_WEBHOOK_URL: str = ""
    DISCORD_NOTIFY_ON_ADD: bool = True
    DISCORD_NOTIFY_REMINDER_DAYS: int = 2
    DISCORD_NOTIFY_ON_DELETE: bool = True

    # Feature Toggles
    MOVIES_CLEANUP_ENABLED: bool = True
    TV_CLEANUP_ENABLED: bool = False
    DEFAULT_UNWATCHED_MONTHS_MOVIES: int = 6
    DEFAULT_UNWATCHED_MONTHS_SHOWS: int = 6
    TRACK_WATCH_ALL_USERS: bool = True

    # Collection Titles & Visibility
    LEAVING_COLLECTION_NAME: str = "Leaving at the end of the month"
    RECOMMENDED_MOVIES_COLLECTION: str = "Recommended Movies"
    RECOMMENDED_SHOWS_COLLECTION: str = "Recommended Shows"
    PROMOTE_TO_HOME: bool = True
    PROMOTE_TO_SHARED: bool = True
    PROMOTE_TO_RECOMMENDED: bool = True

    # Sync schedule (Cron string: default runs 3:00 AM daily)
    CRON_SCHEDULE: str = "0 3 * * *"

    @property
    def movie_libraries_list(self) -> List[str]:
        return [lib.strip() for lib in self.PLEX_MOVIE_LIBRARIES.split(",") if lib.strip()]

    @property
    def tv_libraries_list(self) -> List[str]:
        return [lib.strip() for lib in self.PLEX_TV_LIBRARIES.split(",") if lib.strip()]

settings = Settings()

# Ensure DATA_DIR exists
Path(settings.DATA_DIR).mkdir(parents=True, exist_ok=True)
