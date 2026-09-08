"""Hackathon AI provider.

Talks to the organiser-provided gateway, which is an Ollama-native API fronting
AWS Bedrock Claude Sonnet 4.5.

Confirmed contract (probed against the live gateway):
- Endpoint: ``POST {base}/api/chat``
- Auth: ``Authorization: Bearer <api_key>``
- Request: ``{"model": ..., "messages": [{"role","content"}], "stream": false}``
- Response: ``{"message": {"role": "assistant", "content": "..."}, "done": true, ...}``

The model returns the structured insight contract as JSON, sometimes wrapped in
a ```json markdown fence and with integer (not string) ``evidence_signal_ids``.
This provider extracts the JSON, coerces evidence ids to strings, and runs the
result through :func:`validate_ai_output` against the supplied signal ids so the
strict contract and grounding rule are enforced regardless of model output.

Security:
- Customer feedback is untrusted; it is placed in the fenced CUSTOMER DATA
  section of the prompt (see ``app.services.ai.prompt``) and never treated as an
  instruction.
- The provider receives only one client's signals per call and has no tools to
  fetch other records.
- The API key is read from configuration/env and never logged.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from typing import Any

import httpx

from app.schemas.ai_result import AIAnalysisResult
from app.services.ai.base import AIProvider, SignalInput
from app.services.ai.prompt import SYSTEM_INSTRUCTIONS, build_analysis_prompt
from app.services.ai.validation import validate_ai_output


class HackathonProviderNotConfiguredError(RuntimeError):
    """Raised when the provider is used without the gateway URL / API key."""


class HackathonProviderError(RuntimeError):
    """Raised when the gateway call fails or returns an unusable response."""


# Instruction appended so the model returns strict JSON we can parse.
_RESPONSE_FORMAT_INSTRUCTION = (
    "\n\nReturn ONLY a single JSON object, no prose, of the form:\n"
    '{"insights": [{"title": str, "summary": str, "category": '
    '"PURCHASE_DRIVER|TRIAL_DRIVER|RETENTION_DRIVER|NON_REPEAT_DRIVER|'
    'PAIN_POINT|UNMET_NEED|CUSTOMER_ANXIETY|EMERGING_DEMAND", '
    '"confidence": number between 0 and 1, "reasoning_summary": str, '
    '"evidence_signal_ids": [the signal ids that support this insight]}]}\n'
    "Every insight MUST cite at least one evidence_signal_id, and you may only "
    "use the signal ids provided in the CUSTOMER DATA section. If you find no "
    "insights, return {\"insights\": []}."
)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def extract_json_object(text: str) -> dict[str, Any] | None:
    """Extract a JSON object from model text.

    Handles: a bare JSON object, a ```json fenced block, or a JSON object
    embedded in surrounding prose (first balanced ``{...}`` span). Returns None
    if nothing parseable is found.
    """
    if not text:
        return None

    candidates: list[str] = []

    # 1) Fenced code block(s).
    for m in _FENCE_RE.finditer(text):
        candidates.append(m.group(1))

    # 2) The whole string.
    candidates.append(text.strip())

    # 3) First balanced brace span in the text.
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(text[start : i + 1])
                    break

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _coerce_evidence_ids(data: dict[str, Any]) -> dict[str, Any]:
    """Coerce evidence_signal_ids to strings so they match supplied ids.

    The gateway model returns numeric ids (e.g. ``[1, 2]``); the contract and the
    engine use string ids. Coercion is defensive and non-destructive: anything
    unexpected is left as-is for the validator to reject.
    """
    insights = data.get("insights")
    if not isinstance(insights, list):
        return data
    for item in insights:
        if not isinstance(item, dict):
            continue
        ids = item.get("evidence_signal_ids")
        if isinstance(ids, list):
            item["evidence_signal_ids"] = [
                str(i) if isinstance(i, (int, float, str)) else i for i in ids
            ]
    return data


class HackathonAIProvider(AIProvider):
    name = "hackathon"

    def __init__(
        self,
        api_base_url: str | None = None,
        api_key: str | None = None,
        model: str = "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
        timeout_seconds: float = 60.0,
        client: httpx.Client | None = None,
    ) -> None:
        self._api_base_url = (api_base_url or "").rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds
        # Injectable client enables testing with a mocked transport (no network).
        self._client = client

    def analyze_signals(self, signals: Sequence[SignalInput]) -> AIAnalysisResult:
        if not self._api_base_url or not self._api_key:
            raise HackathonProviderNotConfiguredError(
                "HackathonAIProvider requires LLM_GATEWAY_URL and "
                "LLM_GATEWAY_API_KEY. Set AI_PROVIDER=mock for local development "
                "without credentials."
            )

        supplied_ids = [s.id for s in signals]
        user_content = build_analysis_prompt(signals) + _RESPONSE_FORMAT_INSTRUCTION

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": SYSTEM_INSTRUCTIONS},
                {"role": "user", "content": user_content},
            ],
            "stream": False,
        }

        content = self._post_chat(payload)

        parsed = extract_json_object(content)
        if parsed is None:
            # Malformed model output must not crash: return an empty, valid result.
            return AIAnalysisResult(insights=[])

        parsed = _coerce_evidence_ids(parsed)
        outcome = validate_ai_output(parsed, supplied_ids)
        return outcome.result

    def _post_chat(self, payload: dict[str, Any]) -> str:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self._api_base_url}/api/chat"
        try:
            if self._client is not None:
                response = self._client.post(url, json=payload, headers=headers)
            else:
                response = httpx.post(
                    url, json=payload, headers=headers, timeout=self._timeout
                )
        except httpx.HTTPError as exc:
            raise HackathonProviderError(f"Gateway request failed: {exc}") from exc

        if response.status_code != 200:
            raise HackathonProviderError(
                f"Gateway returned HTTP {response.status_code}."
            )

        try:
            body = response.json()
        except ValueError as exc:
            raise HackathonProviderError("Gateway response was not JSON.") from exc

        message = body.get("message") if isinstance(body, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            raise HackathonProviderError(
                "Gateway response missing message.content."
            )
        return content

    def health(self) -> bool:
        return bool(self._api_base_url and self._api_key)
