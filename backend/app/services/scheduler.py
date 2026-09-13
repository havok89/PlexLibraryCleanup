import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from ..config import settings
from .sync_engine import sync_engine

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

async def scheduled_sync_job():
    logger.info("Executing periodic scheduled sync job...")
    try:
        result = await sync_engine.run_full_sync()
        logger.info(f"Scheduled sync complete: {result}")
    except Exception as e:
        logger.error(f"Error during scheduled sync job: {e}")

def start_scheduler():
    if not scheduler.running:
        trigger = CronTrigger.from_crontab(settings.CRON_SCHEDULE)
        scheduler.add_job(scheduled_sync_job, trigger, id="daily_cleanup_sync", replace_existing=True)
        scheduler.start()
        logger.info(f"Scheduler started with cron: {settings.CRON_SCHEDULE}")

def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")
