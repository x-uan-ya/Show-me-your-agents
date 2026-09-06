"""Customer Insight Intelligence evaluation suite.

Scope: evaluates ONLY the Customer Insight Intelligence component (ingestion ->
insight engine -> evidence quality -> client isolation / prompt-injection
handling). It does not evaluate campaign strategy or other team modules.

All cases use synthetic development data. Every metric is measured by running the
real system code against these cases; nothing is hardcoded or invented.
"""
