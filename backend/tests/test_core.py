import os
import unittest
import asyncio
from datetime import datetime

# Set temporary data dir for testing
os.environ["DATA_DIR"] = "./test_data"

from app.models.db import (
    init_db,
    add_to_whitelist,
    remove_from_whitelist,
    is_whitelisted,
    get_all_whitelist,
    toggle_recommendation,
    is_recommended,
    get_all_recommendations,
    set_dynamic_setting,
    get_dynamic_setting,
    create_session,
    get_session,
    delete_session
)
from app.services.sync_engine import get_end_of_month_date
from app.services.discord import discord_notifier
from app.services.arr import arr_client

class TestCoreFunctions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_whitelist_cycle(self):
        key = "99999"
        self.assertFalse(is_whitelisted(key))
        add_to_whitelist(key, "movie", "Test Movie", 2024, "Favorite")
        self.assertTrue(is_whitelisted(key))
        
        all_wl = get_all_whitelist()
        self.assertTrue(any(item["rating_key"] == key for item in all_wl))
        
        remove_from_whitelist(key)
        self.assertFalse(is_whitelisted(key))

    def test_recommendations_order(self):
        key1 = "101"
        key2 = "102"
        
        # Toggle key1 then key2
        toggle_recommendation(key1, "movie", "First Rec", 2020)
        asyncio.run(asyncio.sleep(0.05))
        toggle_recommendation(key2, "movie", "Second Rec", 2021)
        
        recs = get_all_recommendations(media_type="movie")
        # Key2 should be first because it was favorited most recently
        self.assertEqual(recs[0]["rating_key"], key2)
        self.assertEqual(recs[1]["rating_key"], key1)
        
        # Untoggle key1
        state = toggle_recommendation(key1, "movie", "First Rec", 2020)
        self.assertFalse(state)
        self.assertFalse(is_recommended(key1))
        self.assertTrue(is_recommended(key2))
        
        # Clean up
        toggle_recommendation(key2, "movie", "Second Rec", 2021)

    def test_dynamic_settings(self):
        set_dynamic_setting("TEST_FLAG", "active")
        val = get_dynamic_setting("TEST_FLAG")
        self.assertEqual(val, "active")

    def test_end_of_month_date(self):
        eom = get_end_of_month_date()
        self.assertIsInstance(eom, datetime)
        self.assertEqual(eom.hour, 23)
        self.assertEqual(eom.minute, 59)
        self.assertEqual(eom.second, 59)

    def test_arr_dry_run_delete(self):
        async def run_delete():
            # In dry-run mode, should safely handle non-existent movie without crashing
            res = await arr_client.delete_movie(999999, dry_run=True)
            return res
        res = asyncio.run(run_delete())
        self.assertFalse(res) # Not found in unconfigured Radarr

    def test_session_lifecycle(self):
        from datetime import datetime, timedelta
        sess_id = "test-token-12345"
        expires = datetime.utcnow() + timedelta(days=1)
        create_session(sess_id, "user-99", "TestAdmin", "admin@example.com", "https://avatar.png", expires)
        
        sess = get_session(sess_id)
        self.assertIsNotNone(sess)
        self.assertEqual(sess["username"], "TestAdmin")
        self.assertEqual(sess["plex_user_id"], "user-99")
        
        delete_session(sess_id)
        self.assertIsNone(get_session(sess_id))

if __name__ == "__main__":
    unittest.main()
