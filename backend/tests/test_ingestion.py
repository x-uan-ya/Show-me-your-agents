"""CSV ingestion tests.

Covers the full adaptive flow: upload/inspect, mapping suggestion, and confirm
with normalisation. Uses an isolated in-memory SQLite database via a dependency
override so tests are deterministic.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _make_client(client: TestClient, name: str = "Acme") -> int:
    resp = client.post("/api/clients", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


def _upload(client: TestClient, client_id: int, csv_text: str, filename: str = "data.csv"):
    return client.post(
        f"/api/clients/{client_id}/datasets/upload",
        files={"file": (filename, csv_text.encode("utf-8"), "text/csv")},
    )


def test_normal_csv(client: TestClient) -> None:
    cid = _make_client(client)
    csv_text = "text,rating,date\nGreat product,5,2024-01-02\nLoved it,4,2024-02-03\n"
    up = _upload(client, cid, csv_text)
    assert up.status_code == 201
    body = up.json()
    assert "text" in body["suggested_mapping"]
    assert body["suggested_mapping"]["text"] == "text"
    assert len(body["sample_rows"]) == 2

    dataset_id = body["dataset_id"]
    confirm = client.post(
        f"/api/datasets/{dataset_id}/confirm-mapping",
        json={"mapping": body["suggested_mapping"]},
    )
    assert confirm.status_code == 200
    result = confirm.json()
    assert result["imported"] == 2
    assert result["skipped"] == 0
    assert result["errors"] == []

    # Signals are visible under the owning client.
    signals = client.get(f"/api/clients/{cid}/signals").json()
    assert len(signals) == 2


def test_alternative_headings(client: TestClient) -> None:
    cid = _make_client(client)
    csv_text = "customer_comment,stars,review_date,item_name\nNice,5,2024-01-01,Widget\n"
    up = _upload(client, cid, csv_text)
    assert up.status_code == 201
    mapping = up.json()["suggested_mapping"]
    assert mapping["text"] == "customer_comment"
    assert mapping["rating"] == "stars"
    assert mapping["date"] == "review_date"
    assert mapping["product"] == "item_name"


def test_missing_text_field(client: TestClient) -> None:
    cid = _make_client(client)
    # No column maps to text.
    csv_text = "rating,date\n5,2024-01-01\n"
    up = _upload(client, cid, csv_text)
    dataset_id = up.json()["dataset_id"]
    confirm = client.post(
        f"/api/datasets/{dataset_id}/confirm-mapping",
        json={"mapping": {"rating": "rating"}},
    )
    assert confirm.status_code == 400
    assert "text" in confirm.json()["detail"].lower()


def test_empty_rows_are_skipped(client: TestClient) -> None:
    cid = _make_client(client)
    csv_text = "text,rating\nGood,5\n   ,3\n,\nAlso good,4\n"
    up = _upload(client, cid, csv_text)
    body = up.json()
    confirm = client.post(
        f"/api/datasets/{body['dataset_id']}/confirm-mapping",
        json={"mapping": {"text": "text", "rating": "rating"}},
    ).json()
    assert confirm["imported"] == 2
    assert confirm["skipped"] == 2


def test_malformed_dates_recorded_not_dropped(client: TestClient) -> None:
    cid = _make_client(client)
    csv_text = "text,date\nHello,not-a-date\nWorld,2024-01-01\n"
    up = _upload(client, cid, csv_text)
    body = up.json()
    confirm = client.post(
        f"/api/datasets/{body['dataset_id']}/confirm-mapping",
        json={"mapping": {"text": "text", "date": "date"}},
    ).json()
    # Both rows imported; one error recorded for the bad date.
    assert confirm["imported"] == 2
    assert confirm["skipped"] == 0
    assert len(confirm["errors"]) == 1
    assert confirm["errors"][0]["row"] == 1


def test_malformed_ratings_recorded_not_dropped(client: TestClient) -> None:
    cid = _make_client(client)
    csv_text = "text,rating\nHello,high\nWorld,4\n"
    up = _upload(client, cid, csv_text)
    body = up.json()
    confirm = client.post(
        f"/api/datasets/{body['dataset_id']}/confirm-mapping",
        json={"mapping": {"text": "text", "rating": "rating"}},
    ).json()
    assert confirm["imported"] == 2
    assert len(confirm["errors"]) == 1


def test_unknown_columns_preserved_in_metadata(client: TestClient) -> None:
    cid = _make_client(client)
    csv_text = "text,mystery_col,other\nHello,foo,bar\n"
    up = _upload(client, cid, csv_text)
    body = up.json()
    client.post(
        f"/api/datasets/{body['dataset_id']}/confirm-mapping",
        json={"mapping": {"text": "text"}},
    )
    signals = client.get(f"/api/clients/{cid}/signals").json()
    assert len(signals) == 1
    metadata = signals[0]["metadata"]
    assert metadata.get("mystery_col") == "foo"
    assert metadata.get("other") == "bar"
    # Mapped text column must not leak into metadata.
    assert "text" not in metadata


def test_wrong_client_upload_returns_404(client: TestClient) -> None:
    up = _upload(client, 9999, "text\nHello\n")
    assert up.status_code == 404


def test_invalid_file_type_rejected(client: TestClient) -> None:
    cid = _make_client(client)
    resp = client.post(
        f"/api/clients/{cid}/datasets/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


def test_invalid_csv_content_rejected(client: TestClient) -> None:
    cid = _make_client(client)
    # Empty CSV body -> no header row.
    resp = _upload(client, cid, "")
    assert resp.status_code == 400


def test_confirm_unknown_column_rejected(client: TestClient) -> None:
    cid = _make_client(client)
    up = _upload(client, cid, "text\nHello\n")
    dataset_id = up.json()["dataset_id"]
    confirm = client.post(
        f"/api/datasets/{dataset_id}/confirm-mapping",
        json={"mapping": {"text": "does_not_exist"}},
    )
    assert confirm.status_code == 400


def test_customer_text_not_altered_beyond_trim(client: TestClient) -> None:
    cid = _make_client(client)
    # Internal punctuation/casing preserved; only outer whitespace trimmed.
    csv_text = 'text\n"  Best. Purchase. EVER!!  "\n'
    up = _upload(client, cid, csv_text)
    body = up.json()
    client.post(
        f"/api/datasets/{body['dataset_id']}/confirm-mapping",
        json={"mapping": {"text": "text"}},
    )
    signals = client.get(f"/api/clients/{cid}/signals").json()
    assert signals[0]["text"] == "Best. Purchase. EVER!!"
