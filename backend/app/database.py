"""Database connection and session management using SQLAlchemy.

SQLite is used for development. The engine is configured generically so the
underlying store can be swapped later without touching business logic.
"""

from collections.abc import Generator

from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# check_same_thread is a SQLite-specific requirement for use with FastAPI.
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Imported models must be registered before calling."""
    # Import models so they register with Base.metadata.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    migrate_sqlite_multitenancy(engine)


def migrate_sqlite_multitenancy(target_engine: Engine) -> None:
    """Add tenant columns to pre-workspace SQLite databases without data loss.

    ``create_all`` creates new tables but does not add columns to existing
    tables. This small, idempotent compatibility migration keeps the hackathon
    database usable while assigning legacy records to one isolated workspace.
    New databases already have the complete schema and only skip the ALTERs.
    """

    if target_engine.dialect.name != "sqlite":
        return

    with target_engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "users" in tables:
            user_columns = {
                column[1]
                for column in connection.execute(text("PRAGMA table_info(users)"))
            }
            if "session_version" not in user_columns:
                connection.execute(
                    text(
                        "ALTER TABLE users ADD COLUMN "
                        "session_version INTEGER NOT NULL DEFAULT 1"
                    )
                )
        if not {"users", "clients", "client_memberships"}.issubset(tables):
            return

        client_columns = {
            column[1]
            for column in connection.execute(text("PRAGMA table_info(clients)"))
        }
        if "workspace_id" not in client_columns:
            connection.execute(text("ALTER TABLE clients ADD COLUMN workspace_id INTEGER"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_clients_workspace_id ON clients (workspace_id)")
        )

        membership_columns = {
            column[1]
            for column in connection.execute(text("PRAGMA table_info(client_memberships)"))
        }
        if "role" not in membership_columns:
            connection.execute(
                text("ALTER TABLE client_memberships ADD COLUMN role VARCHAR(32)")
            )
        if "is_active" not in membership_columns:
            connection.execute(
                text(
                    "ALTER TABLE client_memberships "
                    "ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
                )
            )

        needs_legacy_workspace = connection.scalar(
            text(
                "SELECT EXISTS(SELECT 1 FROM clients WHERE workspace_id IS NULL) "
                "OR EXISTS("
                "SELECT 1 FROM users u WHERE NOT EXISTS ("
                "SELECT 1 FROM workspace_memberships wm WHERE wm.user_id = u.id"
                "))"
            )
        )
        legacy_workspace_id: int | None = None
        if needs_legacy_workspace:
            legacy_workspace_id = connection.scalar(
                text(
                    "SELECT id FROM workspaces "
                    "WHERE name = :name ORDER BY id LIMIT 1"
                ),
                {"name": "Legacy Agency Workspace"},
            )
            if legacy_workspace_id is None:
                result = connection.execute(
                    text("INSERT INTO workspaces (name) VALUES (:name)"),
                    {"name": "Legacy Agency Workspace"},
                )
                legacy_workspace_id = int(result.lastrowid)
            connection.execute(
                text("UPDATE clients SET workspace_id = :workspace_id WHERE workspace_id IS NULL"),
                {"workspace_id": legacy_workspace_id},
            )
            connection.execute(
                text(
                    "INSERT OR IGNORE INTO workspace_memberships "
                    "(user_id, workspace_id, role, is_active) "
                    "SELECT id, :workspace_id, "
                    "CASE WHEN role IN ('admin', 'strategist', 'reviewer', 'viewer') "
                    "THEN role ELSE 'viewer' END, is_active FROM users u "
                    "WHERE NOT EXISTS ("
                    "SELECT 1 FROM workspace_memberships wm WHERE wm.user_id = u.id"
                    ")"
                ),
                {"workspace_id": legacy_workspace_id},
            )

        # A direct client assignment always implies membership in that client's
        # workspace. This also repairs partially migrated development databases.
        connection.execute(
            text(
                "INSERT OR IGNORE INTO workspace_memberships "
                "(user_id, workspace_id, role, is_active) "
                "SELECT DISTINCT cm.user_id, c.workspace_id, "
                "CASE WHEN u.role IN ('admin', 'strategist', 'reviewer', 'viewer') "
                "THEN u.role ELSE 'viewer' END, u.is_active "
                "FROM client_memberships cm "
                "JOIN clients c ON c.id = cm.client_id "
                "JOIN users u ON u.id = cm.user_id "
                "WHERE c.workspace_id IS NOT NULL"
            )
        )
        connection.execute(
            text(
                "UPDATE client_memberships SET role = COALESCE("
                "(SELECT CASE WHEN users.role IN "
                "('admin', 'strategist', 'reviewer', 'viewer') "
                "THEN users.role ELSE 'viewer' END "
                "FROM users WHERE users.id = client_memberships.user_id), 'viewer') "
                "WHERE role IS NULL OR role = ''"
            )
        )
