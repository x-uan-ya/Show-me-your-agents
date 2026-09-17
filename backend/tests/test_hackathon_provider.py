"""HackathonAIProvider tests.

All tests use an httpx.MockTransport so no live network calls are made. They
verify the provider parses the Ollama-native gateway response, extracts JSON
(including markdown-fenced), coerces integer evidence ids to strings, enforces
the strict contract against supplied signal ids, and fails clearly on errors.
"""

import json

import httpx
import pytest

from app.services.ai.base import CampaignGapInput, CampaignInsightInput, SignalInput
from app.services.ai.hackathon_provider import (
    HackathonAIProvider,
    HackathonProviderError,
    HackathonProviderNotConfiguredError,
    extract_json_object,
    _usage_counts,
)

SIGNALS = [
    SignalInput(id="1", text="I bought it because it was the cheapest."),
    SignalInput(id="2", text="Support never replied, very frustrating."),
]


def _provider_returning(content: str, status_code: int = 200) -> HackathonAIProvider:
    """Build a provider whose gateway returns a fixed Ollama-style response."""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/chat"
        assert request.headers["Authorization"] == "Bearer test-key"
        request_body = json.loads(request.content)
        assert request_body["format"] == "json"
        assert request_body["options"] == {"temperature": 0, "num_predict": 1800}
        if status_code != 200:
            return httpx.Response(status_code, json={"error": "boom"})
        return httpx.Response(
            200,
            json={
                "model": "m",
                "message": {"role": "assistant", "content": content},
                "done": True,
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    return HackathonAIProvider(
        api_base_url="https://gateway.example",
        api_key="test-key",
        model="m",
        client=client,
    )


def _valid_payload(evidence_ids) -> str:
    return json.dumps(
        {
            "insights": [
                {
                    "title": "Price-driven purchase",
                    "summary": "Customers cite low price as the reason to buy.",
                    "category": "PURCHASE_DRIVER",
                    "confidence": 0.8,
                    "reasoning_summary": "Explicit price mention.",
                    "evidence_signal_ids": evidence_ids,
                }
            ]
        }
    )


# --- extract_json_object ----------------------------------------------------


def test_extract_bare_json():
    assert extract_json_object('{"insights": []}') == {"insights": []}


def test_extract_fenced_json():
    text = "Here you go:\n```json\n{\"insights\": []}\n```\nthanks"
    assert extract_json_object(text) == {"insights": []}


def test_extract_embedded_json():
    text = "prose before {\"insights\": [], \"x\": 1} prose after"
    assert extract_json_object(text) == {"insights": [], "x": 1}


def test_extract_returns_none_for_garbage():
    assert extract_json_object("no json here at all") is None
    assert extract_json_object("") is None


def test_usage_counts_supports_ollama_response():
    assert _usage_counts({"prompt_eval_count": 120, "eval_count": 30}) == (120, 30)


def test_usage_counts_supports_openai_style_response():
    assert _usage_counts(
        {"usage": {"prompt_tokens": 80, "completion_tokens": 20}}
    ) == (80, 20)


# --- provider behaviour -----------------------------------------------------


def test_valid_structured_response_parsed():
    provider = _provider_returning(_valid_payload(["1"]))
    result = provider.analyze_signals(SIGNALS)
    assert len(result.insights) == 1
    assert result.insights[0].category.value == "PURCHASE_DRIVER"
    assert result.insights[0].evidence_signal_ids == ["1"]


def test_markdown_fenced_response_parsed():
    provider = _provider_returning("```json\n" + _valid_payload(["1"]) + "\n```")
    result = provider.analyze_signals(SIGNALS)
    assert len(result.insights) == 1


def test_integer_evidence_ids_are_coerced():
    # Model returns numeric ids; provider coerces to strings so they match.
    provider = _provider_returning(_valid_payload([1]))
    result = provider.analyze_signals(SIGNALS)
    assert len(result.insights) == 1
    assert result.insights[0].evidence_signal_ids == ["1"]


def test_unsupported_evidence_id_rejected():
    # References a signal id that was never supplied -> dropped by validation.
    provider = _provider_returning(_valid_payload([999]))
    with pytest.raises(HackathonProviderError, match="unknown signal id"):
        provider.analyze_signals(SIGNALS)


def test_malformed_content_surfaces_provider_error():
    provider = _provider_returning("I could not produce JSON, sorry.")
    with pytest.raises(
        HackathonProviderError,
        match="Response preview: I could not produce JSON, sorry",
    ):
        provider.analyze_signals(SIGNALS)


def test_empty_insights_surfaces_provider_error():
    provider = _provider_returning('{"insights": []}')
    with pytest.raises(HackathonProviderError, match="empty insights list"):
        provider.analyze_signals(SIGNALS)


def test_http_error_surfaced():
    provider = _provider_returning("{}", status_code=500)
    with pytest.raises(HackathonProviderError):
        provider.analyze_signals(SIGNALS)


def test_missing_content_surfaced():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"done": True})  # no message.content

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = HackathonAIProvider(
        api_base_url="https://gateway.example", api_key="k", client=client
    )
    with pytest.raises(HackathonProviderError):
        provider.analyze_signals(SIGNALS)


def test_not_configured_raises():
    provider = HackathonAIProvider(api_base_url=None, api_key=None)
    with pytest.raises(HackathonProviderNotConfiguredError):
        provider.analyze_signals(SIGNALS)
    assert provider.health() is False


def test_health_true_when_configured():
    provider = HackathonAIProvider(api_base_url="https://x", api_key="k")
    assert provider.health() is True


def test_campaign_gap_uses_gateway_and_validates_insight_ids():
    content = json.dumps(
        {
            "alignment": "partial",
            "summary": "The message reflects convenience but misses queue concerns.",
            "matched_customer_values": ["Convenience"],
            "message_gaps": ["Peak-hour waiting time"],
            "recommended_actions": ["Address queue expectations"],
            "supporting_insight_ids": [7],
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["model"] == "m"
        assert body["format"] == "json"
        assert body["options"] == {"temperature": 0, "num_predict": 1200}
        prompt = body["messages"][0]["content"]
        assert "objective, audience, active" in prompt
        assert "strength of customer evidence" in prompt
        assert "CAM001" in body["messages"][1]["content"]
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": content}},
        )

    provider = HackathonAIProvider(
        api_base_url="https://gateway.example",
        api_key="test-key",
        model="m",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    result = provider.analyze_campaign_gap(
        CampaignGapInput(
            campaign_id="CAM001",
            objective="Increase lunch traffic",
            target_audience="Office workers",
            active_message="Fast weekday lunch",
            channel="Instagram",
        ),
        [
            CampaignInsightInput(
                id=7,
                category="PAIN_POINT",
                title="Long queues reduce confidence",
                summary="Customers mention peak-hour waiting time.",
            )
        ],
    )

    assert result.alignment == "partial"
    assert result.supporting_insight_ids == [7]


def test_campaign_gap_rejects_unknown_insight_id():
    content = json.dumps(
        {
            "alignment": "misaligned",
            "summary": "The message misses the supplied customer evidence.",
            "matched_customer_values": [],
            "message_gaps": ["Missing value"],
            "recommended_actions": ["Revise the message"],
            "supporting_insight_ids": [999],
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": content}},
        )

    provider = HackathonAIProvider(
        api_base_url="https://gateway.example",
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    with pytest.raises(HackathonProviderError, match="unknown insight ids"):
        provider.analyze_campaign_gap(
            CampaignGapInput("CAM001", "Goal", "Audience", "Message", "Email"),
            [CampaignInsightInput(7, "PAIN_POINT", "Concern", "Summary")],
        )
