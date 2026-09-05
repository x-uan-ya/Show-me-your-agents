"""Customer insight categories for the multi-client data model.

These are the allowed values for CustomerInsight.category. The values are the
canonical UPPERCASE names used across the API and storage. They mirror the
behavioural taxonomy described in ``taxonomy.py`` but are the enum used by the
persisted data model.
"""

from enum import Enum


class InsightCategory(str, Enum):
    PURCHASE_DRIVER = "PURCHASE_DRIVER"
    TRIAL_DRIVER = "TRIAL_DRIVER"
    RETENTION_DRIVER = "RETENTION_DRIVER"
    NON_REPEAT_DRIVER = "NON_REPEAT_DRIVER"
    PAIN_POINT = "PAIN_POINT"
    UNMET_NEED = "UNMET_NEED"
    CUSTOMER_ANXIETY = "CUSTOMER_ANXIETY"
    EMERGING_DEMAND = "EMERGING_DEMAND"
