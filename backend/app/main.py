"""FastAPI application entrypoint.

Wires configuration, CORS, database initialisation, and routers. The app is
data-source-independent and runs in MOCK AI mode by default with no external
credentials required.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs"}
