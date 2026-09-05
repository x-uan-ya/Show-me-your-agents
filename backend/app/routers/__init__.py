"""API routers."""

from app.routers.analysis import router as analysis_router
from app.routers.behaviour import router as behaviour_router
from app.routers.clients import router as clients_router
from app.routers.datasets import clients_datasets_router
from app.routers.health import router as health_router
from app.routers.insights import router as insights_router

__all__ = [
    "analysis_router",
    "behaviour_router",
    "clients_router",
    "clients_datasets_router",
    "health_router",
    "insights_router",
]
