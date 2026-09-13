import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import settings
from .models.db import init_db
from .api.routes import router as api_router
from .api.auth import auth_router
from .api.poster import poster_router
from .services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing SQLite database...")
    init_db()
    logger.info("Starting background scheduler...")
    start_scheduler()

    # Pre-warm media cache in background so first user visit is instant (< 5ms)
    async def prewarm():
        import asyncio
        await asyncio.sleep(1)
        try:
            from .services.sync_engine import sync_engine
            logger.info("Pre-warming media cache in background...")
            await sync_engine.get_enriched_media("movie", force_refresh=True)
            await sync_engine.get_enriched_media("show", force_refresh=True)
            logger.info("Media cache pre-warmed successfully!")
        except Exception as e:
            logger.warning(f"Error pre-warming media cache: {e}")

    import asyncio
    asyncio.create_task(prewarm())

    yield
    # Shutdown
    logger.info("Stopping background scheduler...")
    stop_scheduler()

app = FastAPI(
    title="Plex Library Cleanup API",
    description="Automated library cleanup and curated recommendations manager for Plex",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(poster_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(api_router, prefix="/api")

# Static files for production built frontend
static_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if not os.path.exists(static_dir):
    # Docker container directory structure
    static_dir = "/app/frontend/dist"

if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(static_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT)
