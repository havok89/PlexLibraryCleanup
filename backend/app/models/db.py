import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from ..config import settings

DB_PATH = os.path.join(settings.DATA_DIR, "cleanup.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Whitelisted items (never delete)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS whitelist (
                rating_key TEXT PRIMARY KEY,
                media_type TEXT NOT NULL,
                title TEXT NOT NULL,
                year INTEGER,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Curated recommendations (ordered by favorited_at DESC)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recommendations (
                rating_key TEXT PRIMARY KEY,
                media_type TEXT NOT NULL,
                title TEXT NOT NULL,
                year INTEGER,
                poster_url TEXT,
                favorited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Scheduled items for leaving at end of month
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_items (
                rating_key TEXT PRIMARY KEY,
                media_type TEXT NOT NULL,
                title TEXT NOT NULL,
                year INTEGER,
                size_bytes INTEGER DEFAULT 0,
                requester_name TEXT,
                requester_avatar TEXT,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                scheduled_delete_at TIMESTAMP NOT NULL,
                status TEXT DEFAULT 'staged'
            )
        """)
        
        # Persistent settings overrides from UI
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dynamic_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # User sessions for Plex Auth
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                plex_user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                email TEXT,
                thumb TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        """)
        
        conn.commit()

# Session helpers
def create_session(session_id: str, plex_user_id: str, username: str, email: Optional[str], thumb: Optional[str], expires_at: datetime):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sessions (session_id, plex_user_id, username, email, thumb, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (session_id, plex_user_id, username, email, thumb, expires_at))
        conn.commit()

def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE session_id = ? AND expires_at > CURRENT_TIMESTAMP", (session_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def delete_session(session_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        conn.commit()


# Whitelist helpers
def is_whitelisted(rating_key: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM whitelist WHERE rating_key = ?", (str(rating_key),))
        return cursor.fetchone() is not None

def get_all_whitelist() -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM whitelist ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

def add_to_whitelist(rating_key: str, media_type: str, title: str, year: Optional[int] = None, reason: str = ""):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO whitelist (rating_key, media_type, title, year, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (str(rating_key), media_type, title, year, reason, datetime.utcnow()))
        conn.commit()

def remove_from_whitelist(rating_key: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM whitelist WHERE rating_key = ?", (str(rating_key),))
        conn.commit()

# Recommendation helpers
def is_recommended(rating_key: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM recommendations WHERE rating_key = ?", (str(rating_key),))
        return cursor.fetchone() is not None

def get_all_recommendations(media_type: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        if media_type:
            cursor.execute("SELECT * FROM recommendations WHERE media_type = ? ORDER BY favorited_at DESC", (media_type,))
        else:
            cursor.execute("SELECT * FROM recommendations ORDER BY favorited_at DESC")
        return [dict(row) for row in cursor.fetchall()]

def toggle_recommendation(rating_key: str, media_type: str, title: str, year: Optional[int] = None, poster_url: str = "") -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM recommendations WHERE rating_key = ?", (str(rating_key),))
        exists = cursor.fetchone() is not None
        if exists:
            cursor.execute("DELETE FROM recommendations WHERE rating_key = ?", (str(rating_key),))
            conn.commit()
            return False
        else:
            cursor.execute("""
                INSERT INTO recommendations (rating_key, media_type, title, year, poster_url, favorited_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (str(rating_key), media_type, title, year, poster_url, datetime.utcnow()))
            conn.commit()
            return True

# Dynamic settings helpers
def get_dynamic_setting(key: str, default: Any = None) -> Any:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM dynamic_settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        if row:
            return row["value"]
        return default

def set_dynamic_setting(key: str, value: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO dynamic_settings (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()
