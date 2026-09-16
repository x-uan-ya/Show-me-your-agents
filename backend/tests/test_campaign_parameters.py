"""Tests for Dataset 3 campaign parameter loading and validation."""

from pathlib import Path

import pytest

from app.services.campaign_gap.parameters import (
    CampaignParameterError,
    load_campaign_parameters_csv,
)


def _write_csv(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "campaign_parameters.csv"
    path.write_text(content, encoding="utf-8")
    return path


def test_repository_dataset3_is_valid() -> None:
    records = load_campaign_parameters_csv()

    assert len(records) == 500
    assert records[0].campaign_id == "CAM001"
    assert records[-1].campaign_id == "CAM500"
    assert len({record.campaign_id for record in records}) == 500
    assert all(record.objective for record in records)
    assert all(record.target_audience for record in records)
    assert all(record.active_message for record in records)
    assert all(record.channel for record in records)


def test_loader_accepts_utf8_bom(tmp_path: Path) -> None:
    path = tmp_path / "campaign_parameters.csv"
    path.write_text(
        "campaign_id,objective,target_audience,active_message,channel\n"
        "CAM001,Increase trials,New customers,Try us today,Instagram\n",
        encoding="utf-8-sig",
    )

    records = load_campaign_parameters_csv(path)

    assert records[0].campaign_id == "CAM001"


def test_loader_rejects_missing_required_column(tmp_path: Path) -> None:
    path = _write_csv(
        tmp_path,
        "campaign_id,objective,target_audience,channel\n"
        "CAM001,Increase trials,New customers,Instagram\n",
    )

    with pytest.raises(CampaignParameterError, match="active_message"):
        load_campaign_parameters_csv(path)


def test_loader_rejects_empty_required_value(tmp_path: Path) -> None:
    path = _write_csv(
        tmp_path,
        "campaign_id,objective,target_audience,active_message,channel\n"
        "CAM001,Increase trials,,Try us today,Instagram\n",
    )

    with pytest.raises(CampaignParameterError, match="target_audience"):
        load_campaign_parameters_csv(path)


def test_loader_rejects_duplicate_campaign_id(tmp_path: Path) -> None:
    path = _write_csv(
        tmp_path,
        "campaign_id,objective,target_audience,active_message,channel\n"
        "CAM001,Increase trials,New customers,Try us today,Instagram\n"
        "CAM001,Increase trials,New customers,Try us today,TikTok\n",
    )

    with pytest.raises(CampaignParameterError, match="duplicate campaign_id"):
        load_campaign_parameters_csv(path)
