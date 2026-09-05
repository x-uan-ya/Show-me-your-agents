"""Evidence service.

Every insight must be traceable to its source. This service validates and
prepares supporting evidence excerpts so insights are never asserted without
grounding in the original feedback.
"""


class EvidenceService:
    @staticmethod
    def validate_excerpt(evidence: str, source_content: str) -> bool:
        """Return True if the evidence is grounded in the source content.

        For the foundation we require a non-empty excerpt that is contained in
        the source text (case-insensitive). Providers that paraphrase can relax
        this later, but grounding-by-containment is a safe default.
        """
        if not evidence.strip():
            return False
        return evidence.strip().lower() in source_content.strip().lower()
