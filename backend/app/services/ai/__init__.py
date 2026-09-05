"""Provider-agnostic AI layer."""

from app.services.ai.base import AIProvider, SignalInput
from app.services.ai.factory import build_provider, get_ai_provider
from app.services.ai.hackathon_provider import (
    HackathonAIProvider,
    HackathonProviderNotConfiguredError,
)
from app.services.ai.mock_provider import MockAIProvider
from app.services.ai.prompt import SYSTEM_INSTRUCTIONS, build_analysis_prompt
from app.services.ai.validation import ValidationOutcome, validate_ai_output

__all__ = [
    "AIProvider",
    "SignalInput",
    "MockAIProvider",
    "HackathonAIProvider",
    "HackathonProviderNotConfiguredError",
    "ValidationOutcome",
    "validate_ai_output",
    "build_analysis_prompt",
    "SYSTEM_INSTRUCTIONS",
    "build_provider",
    "get_ai_provider",
]
