"""API routers."""

from app.routers.health import router as health_router
from app.routers.insights import router as insights_router

__all__ = ["health_router", "insights_router"]
