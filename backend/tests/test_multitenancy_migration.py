"""Compatibility migration tests for existing pre-workspace SQLite stores."""

from sqlalchemy import create_engine, inspect, text

from app.database import Base, migrate_sqlite_multitenancy


def test_legacy_database_is_scoped_without_losing_records():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE users ("
                "id INTEGER PRIMARY KEY, email VARCHAR(320) NOT NULL, "
                "password_hash VARCHAR(512) NOT NULL, display_name VARCHAR(128) NOT NULL, "
                "role VARCHAR(32) NOT NULL, is_active BOOLEAN NOT NULL, "
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE clients ("
                "id INTEGER PRIMARY KEY, name VARCHAR(256) NOT NULL, "
                "industry VARCHAR(128), description TEXT, "
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, "
                "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE client_memberships ("
                "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, client_id INTEGER NOT NULL, "
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, "
                "UNIQUE(user_id, client_id))"
            )
        )
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, email, password_hash, display_name, role, is_active) "
                "VALUES (1, 'reviewer@example.test', 'hash', 'Reviewer', 'reviewer', 1)"
            )
        )
        connection.execute(
            text("INSERT INTO clients (id, name) VALUES (7, 'Legacy Client')")
        )
        connection.execute(
            text(
                "INSERT INTO client_memberships (id, user_id, client_id) "
                "VALUES (11, 1, 7)"
            )
        )

    Base.metadata.create_all(bind=engine)
    migrate_sqlite_multitenancy(engine)
    # Idempotency matters because init_db runs on every local startup.
    migrate_sqlite_multitenancy(engine)

    with engine.connect() as connection:
        user_columns = {column["name"] for column in inspect(connection).get_columns("users")}
        client_columns = {column["name"] for column in inspect(connection).get_columns("clients")}
        membership_columns = {
            column["name"]
            for column in inspect(connection).get_columns("client_memberships")
        }
        assert "session_version" in user_columns
        assert "workspace_id" in client_columns
        assert {"role", "is_active"}.issubset(membership_columns)
        assert connection.scalar(text("SELECT count(*) FROM clients")) == 1
        assert connection.scalar(text("SELECT count(*) FROM users")) == 1
        assert connection.scalar(text("SELECT count(*) FROM client_memberships")) == 1
        assert connection.scalar(text("SELECT count(*) FROM workspaces")) == 1
        assert connection.scalar(text("SELECT count(*) FROM workspace_memberships")) == 1
        assert connection.scalar(text("SELECT workspace_id FROM clients WHERE id = 7")) == 1
        assert connection.scalar(
            text("SELECT role FROM client_memberships WHERE id = 11")
        ) == "reviewer"


def test_partial_migration_does_not_add_existing_tenant_users_to_legacy_workspace():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO workspaces (id, name) VALUES "
                "(5, 'Existing Agency'), (6, 'Legacy Agency Workspace')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, email, password_hash, display_name, role, is_active) VALUES "
                "(1, 'owner@example.test', 'hash', 'Owner', 'admin', 1), "
                "(2, 'legacy@example.test', 'hash', 'Legacy', 'reviewer', 1)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO workspace_memberships "
                "(user_id, workspace_id, role, is_active) "
                "VALUES (1, 5, 'admin', 1)"
            )
        )
        # Simulate a partially upgraded store that still contains an unscoped
        # legacy client and an orphaned legacy user.
        connection.execute(
            text("INSERT INTO clients (id, name, workspace_id) VALUES (7, 'Legacy Client', NULL)")
        )

    migrate_sqlite_multitenancy(engine)

    with engine.connect() as connection:
        memberships = connection.execute(
            text(
                "SELECT user_id, workspace_id FROM workspace_memberships "
                "ORDER BY user_id, workspace_id"
            )
        ).all()
        assert memberships == [(1, 5), (2, 6)]
        assert connection.scalar(
            text("SELECT workspace_id FROM clients WHERE id = 7")
        ) == 6
