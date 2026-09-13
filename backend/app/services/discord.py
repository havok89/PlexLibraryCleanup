import logging
from typing import List, Dict, Any, Optional
import httpx
from ..config import settings

logger = logging.getLogger(__name__)

class DiscordNotifier:
    def __init__(self):
        self.webhook_url = settings.DISCORD_WEBHOOK_URL

    @property
    def is_configured(self) -> bool:
        return bool(self.webhook_url and "discord.com/api/webhooks" in self.webhook_url)

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

    async def notify_leaving_soon_added(self, items: List[Dict[str, Any]], target_date_str: str):
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
        desc = (
            f"**{total_count} item(s)** have been marked unwatched and added to the **'Leaving at the end of the month'** collection on Plex.\n"
            f"If someone watches them before **{target_date_str}**, they will be automatically kept!{more_text}"
        )
        await self.send_embed(
            title="⚠️ Notice: Content Leaving at End of Month",
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

    async def notify_cleanup_completed(self, deleted_count: int, reclaimed_bytes: int, dry_run: bool = True):
        reclaimed_gb = reclaimed_bytes / (1024 ** 3)
        prefix = "[DRY RUN] " if dry_run else ""
        desc = (
            f"Successfully processed {deleted_count} items.\n"
            f"**Total space freed:** {reclaimed_gb:.2f} GB."
        )
        if dry_run:
            desc += "\n*(Dry Run enabled — no files were actually deleted)*"

        await self.send_embed(
            title=f"✅ {prefix}Monthly Library Cleanup Finished",
            description=desc,
            color=0x2ECC71 # Green
        )

discord_notifier = DiscordNotifier()
