"""Hackathon AI provider (skeleton only).

The competition organisers will provide, via Slack:
- a JSON API endpoint,
- a team API key,
- access to AWS Bedrock Claude Sonnet 4.5 behind that endpoint,
- the exact JSON request/response format.

None of those are known yet, so this provider is intentionally a SKELETON. We do
NOT guess the endpoint URL, request body, or authentication scheme. Once the
organiser specification arrives, implement ``_call_api`` and ``analyze_signals``
to build the documented request, send it, and pass the response through
``validate_ai_output`` (with the supplied signal ids) so the strict result
contract is enforced regardless of what the model returns.

Until then, every call raises a clear error rather than failing silently or
fabricating results.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.schemas.ai_result import AIAnalysisResult
from app.services.ai.base import AIProvider, SignalInput


class HackathonProviderNotConfiguredError(RuntimeError):
    """Raised when the hackathon provider is used before organiser specs exist."""


_NOT_READY_MESSAGE = (
    "HackathonAIProvider is not implemented yet. The organiser has not provided "
    "the API endpoint, request/response JSON format, or authentication details. "
    "Use AI_PROVIDER=mock for development and tests. Once the organiser spec is "
    "shared via Slack, implement the request/response handling and validate the "
    "output with validate_ai_output(...)."
)


class HackathonAIProvider(AIProvider):
    name = "hackathon"

    def __init__(self, api_base_url: str | None = None, api_key: str | None = None) -> None:
        # Config placeholders only. We deliberately do not assume their shape or
        # that they are even the right settings until the organiser confirms.
        self._api_base_url = api_base_url
        self._api_key = api_key

    def analyze_signals(self, signals: Sequence[SignalInput]) -> AIAnalysisResult:
        raise HackathonProviderNotConfiguredError(_NOT_READY_MESSAGE)

    def health(self) -> bool:
        # Not ready until the organiser specification is implemented.
        return False
