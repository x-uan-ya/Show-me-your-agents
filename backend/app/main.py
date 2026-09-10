"""FastAPI application entrypoint.

Wires configuration, CORS, database initialisation, and routers. The app is
data-source-independent and runs in MOCK AI mode by default with no external
credentials required.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import init_db
from app.routers import (
    analysis_router,
    behaviour_router,
    clients_datasets_router,
    clients_router,
    evaluation_router,
    handoff_router,
    health_router,
    insights_router,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Create tables on startup (SQLite dev store).
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(insights_router, prefix=settings.api_prefix)
app.include_router(clients_router, prefix=settings.api_prefix)
app.include_router(clients_datasets_router, prefix=settings.api_prefix)
app.include_router(analysis_router, prefix=settings.api_prefix)
app.include_router(behaviour_router, prefix=settings.api_prefix)
app.include_router(handoff_router, prefix=settings.api_prefix)
app.include_router(evaluation_router, prefix=settings.api_prefix)


def _mount_frontend(application: FastAPI) -> None:
    """Serve the built Vite frontend from the same origin as the API.

    Single-instance deployment: FastAPI serves both /api/* and the static SPA.
    - Hashed build assets are served from /assets.
    - Any non-API path falls back to index.html so client-side routing works.
    If the build directory is absent (e.g. local split dev), this is skipped and
    a small JSON root is served instead.
    """
    dist_dir = (Path(__file__).resolve().parent.parent / settings.frontend_dist_dir).resolve()
    index_file = dist_dir / "index.html"

    if not (settings.serve_frontend and index_file.is_file()):
        @application.get("/")
        def root() -> dict[str, str]:
            return {"name": settings.app_name, "docs": "/docs"}

        return

    # Serve the hashed asset bundle produced by Vite.
    assets_dir = dist_dir / "assets"
    if assets_dir.is_dir():
        application.mount(
            "/assets", StaticFiles(directory=str(assets_dir)), name="assets"
        )

    @application.get("/")
    def index() -> FileResponse:
        return FileResponse(index_file)

    # SPA fallback: return index.html for any unmatched, non-API GET path.
    # API routes are registered before this and take precedence; we still guard
    # against /api and /docs to avoid masking backend 404s with the SPA shell.
    @application.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        from fastapi import HTTPException

        if full_path.startswith(("api", "docs", "openapi.json", "redoc")):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (dist_dir / full_path).resolve()
        # Serve a real static file if it exists and is inside dist (e.g.
        # favicon); otherwise return the SPA entry point.
        if candidate.is_file() and dist_dir in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index_file)


_mount_frontend(app)
