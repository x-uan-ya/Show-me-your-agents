"""Insight taxonomy.

This is the conceptual heart of the system. We are NOT doing sentiment analysis.
We classify customer feedback into evidence-backed *insight types* that answer
behavioural questions: why customers buy, try once, return, churn, and what they
need that may be unaddressed.

The taxonomy is deliberately generic and data-source-independent so it applies
to any SME or dataset once one is confirmed.
"""

from enum import Enum


class InsightType(str, Enum):
    """The eight behavioural insight categories the system identifies."""

    PURCHASE_DRIVER = "purchase_driver"
    TRIAL_DRIVER = "trial_driver"
    RETENTION_DRIVER = "retention_driver"
    NON_REPEAT_DRIVER = "non_repeat_driver"
    PAIN_POINT = "pain_point"
    UNMET_NEED = "unmet_need"
    CUSTOMER_ANXIETY = "customer_anxiety"
    EMERGING_DEMAND = "emerging_demand"


# Human-readable metadata describing the behavioural question each type answers.
# Kept separate from the enum so it can be served to the frontend and reused by
# any AI provider's prompt construction without duplicating definitions.
INSIGHT_DEFINITIONS: dict[InsightType, dict[str, str]] = {
    InsightType.PURCHASE_DRIVER: {
        "label": "Purchase Driver",
        "question": "Why did someone buy?",
        "description": "A factor that motivated a customer to make a purchase.",
    },
    InsightType.TRIAL_DRIVER: {
        "label": "Trial Driver",
        "question": "Why did someone try only once?",
        "description": "A factor that led a customer to try the product/service, possibly just once.",
    },
    InsightType.RETENTION_DRIVER: {
        "label": "Retention Driver",
        "question": "Why did someone return?",
        "description": "A factor that motivated a customer to come back or continue.",
    },
    InsightType.NON_REPEAT_DRIVER: {
        "label": "Non-Repeat Driver",
        "question": "Why did someone not return?",
        "description": "A factor that prevented a customer from returning or repurchasing.",
    },
    InsightType.PAIN_POINT: {
        "label": "Pain Point",
        "question": "What customer problem is repeatedly appearing?",
        "description": "A recurring problem or friction customers experience.",
    },
    InsightType.UNMET_NEED: {
        "label": "Unmet Need",
        "question": "What do customers want that the company may not be addressing?",
        "description": "A desire or requirement the company may not currently address.",
    },
    InsightType.CUSTOMER_ANXIETY: {
        "label": "Customer Anxiety",
        "question": "What worries or hesitations block customer confidence?",
        "description": "A concern, doubt, or perceived risk that reduces customer confidence.",
    },
    InsightType.EMERGING_DEMAND: {
        "label": "Emerging Demand",
        "question": "What new expectation or trend is starting to appear?",
        "description": "A newly appearing expectation or trend among customers.",
    },
}


def all_definitions() -> list[dict[str, str]]:
    """Return the full taxonomy as a serializable list for API/UI consumption."""
    return [
        {"type": insight_type.value, **meta}
        for insight_type, meta in INSIGHT_DEFINITIONS.items()
    ]
