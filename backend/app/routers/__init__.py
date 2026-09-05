"""API routers."""

from app.routers.clients import router as clients_router
from app.routers.datasets import clients_datasets_router, datasets_router
from app.routers.health import router as health_router
from app.routers.insights import router as insights_router

__all__ = [
    "clients_router",
    "clients_datasets_router",
    "datasets_router",
    "health_router",
    "insights_router",
]
