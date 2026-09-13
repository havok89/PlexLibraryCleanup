import logging
from typing import List, Dict, Any, Optional
import httpx
from ..config import settings
from ..models.db import get_dynamic_setting

logger = logging.getLogger(__name__)

class DiscordNotifier:
    @property
    def webhook_url(self) -> str:
        dyn = get_dynamic_setting("DISCORD_WEBHOOK_URL")
        if dyn is not None:
            return dyn.strip()
        return (settings.DISCORD_WEBHOOK_URL or "").strip()

    @property
    def is_configured(self) -> bool:
        url = self.webhook_url
        return bool(
            url
            and (url.startswith("http://") or url.startswith("https://"))
            and "your_webhook_here" not in url
        )

    async def send_embed(self, title: str, description: str, color: int = 0xE5A00D, fields: Optional[List[Dict[str, Any]]] = None, thumbnail: Optional[str] = None) -> bool:
        if not self.is_configured:
            logger.info("Discord webhook not configured, skipping notification")
            return False

        embed = {
            "title": title,
            "description": description,
            "color": color,
            "footer": {"text": "Plex Library Cleanup"},
        }
        if fields:
            embed["fields"] = fields
        if thumbnail:
            embed["thumbnail"] = {"url": thumbnail}

        payload = {
            "username": "Plex Library Cleaner",
            "avatar_url": "https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/plex.png",
            "embeds": [embed]
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(self.webhook_url, json=payload)
                if res.status_code in (200, 204):
                    return True
                else:
                    logger.error(f"Failed to send Discord webhook: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Error sending Discord webhook: {e}")
        return False

    async def notify_leaving_soon_added(self, items: List[Dict[str, Any]], target_date_str: str, collection_title: Optional[str] = None):
        if not items:
            return
        fields = []
        for it in items[:15]:  # Limit to 15 in embed to stay well within Discord limits
            req = it.get("requester_name") or "Direct Download"
            size_gb = it.get("size_bytes", 0) / (1024 ** 3)
            size_str = f" ({size_gb:.1f} GB)" if size_gb > 0 else ""
            fields.append({
                "name": f"🎬 {it.get('title')} ({it.get('year', 'N/A')}){size_str}",
                "value": f"Requested by: **{req}**",
                "inline": False
            })

        total_count = len(items)
        more_text = f"\n*...and {total_count - 15} more.*" if total_count > 15 else ""
        shelf_title = collection_title or "Leaving Soon"
        desc = (
            f"**{total_count} item(s)** have been marked unwatched and added to the **'{shelf_title}'** collection on Plex.\n"
            f"If someone watches them before **{target_date_str}**, they will be automatically kept!{more_text}"
        )
        await self.send_embed(
            title=f"⚠️ Notice: Content Staged in '{shelf_title}'",
            description=desc,
            color=0xE5A00D, # Plex Amber
            fields=fields
        )

    async def notify_pre_deletion_reminder(self, items: List[Dict[str, Any]], target_date_str: str, dry_run: bool = True):
        if not items:
            return
        total_size_gb = sum(it.get("size_bytes", 0) for it in items) / (1024 ** 3)
        prefix = "[DRY RUN] " if dry_run else ""
        desc = (
            f"**Reminder:** {len(items)} items are scheduled for removal on **{target_date_str}**.\n"
            f"Reclaiming approximately **{total_size_gb:.1f} GB** of disk space."
        )
        fields = [
            {"name": it.get("title"), "value": f"Added: {it.get('added_at', 'Unknown')[:10]}", "inline": True}
            for it in items[:12]
        ]
        await self.send_embed(
            title=f"⏳ {prefix}Cleanup Reminder (Final 48 Hours)",
            description=desc,
            color=0xE74C3C, # Red
            fields=fields
        )

    async def notify_cleanup_completed(self, deleted_count: int, reclaimed_bytes: int, deleted_items: Optional[List[Dict[str, Any]]] = None, dry_run: bool = True):
        reclaimed_gb = reclaimed_bytes / (1024 ** 3)
        prefix = "[DRY RUN] " if dry_run else ""
        desc = (
            f"Successfully processed **{deleted_count} items**.\n"
            f"**Total space recovered:** **{reclaimed_gb:.2f} GB**"
        )
        if dry_run:
            desc += "\n\n*(Dry Run enabled — no files were actually removed from disk)*"

        fields = []
        if deleted_items:
            items_text = []
            for it in deleted_items[:25]:
                size_gb = (it.get("size_bytes") or 0) / (1024 ** 3)
                size_str = f" ({size_gb:.1f} GB)" if size_gb > 0 else ""
                yr_str = f" ({it.get('year')})" if it.get("year") else ""
                items_text.append(f"• **{it.get('title')}**{yr_str}{size_str}")

            if len(deleted_items) > 25:
                items_text.append(f"*...and {len(deleted_items) - 25} more.*")

            fields.append({
                "name": "🗑️ Recovered Items",
                "value": "\n".join(items_text)[:1024],
                "inline": False
            })

        await self.send_embed(
            title=f"✅ {prefix}Monthly Library Cleanup Finished",
            description=desc,
            color=0x2ECC71, # Green
            fields=fields if fields else None
        )

    async def notify_staged_items_watched(self, watched_events: List[Dict[str, Any]]):
        """Sends an alert if items currently staged on the Leaving Soon list were watched"""
        if not watched_events:
            return

        fields = []
        for ev in watched_events[:15]:
            dt = ev.get("viewed_at")
            time_str = dt.strftime("%b %d at %H:%M") if hasattr(dt, "strftime") else str(dt or "Recently")
            user = ev.get("user_name") or "A user"
            yr = f" ({ev.get('year')})" if ev.get("year") else ""
            fields.append({
                "name": f"🎬 {ev.get('title')}{yr}",
                "value": f"Watched by **{user}** on {time_str}\n*(Still scheduled for month-end cleanup)*",
                "inline": False
            })

        total_count = len(watched_events)
        more_text = f"\n*...and {total_count - 15} more.*" if total_count > 15 else ""
        desc = (
            f"**{total_count} item(s)** on the **Leaving Soon** shelf were watched in the last 24 hours:{more_text}"
        )

        await self.send_embed(
            title="👀 Content on Leaving Soon Shelf Was Watched",
            description=desc,
            color=0x3498DB, # Blue
            fields=fields
        )

discord_notifier = DiscordNotifier()
