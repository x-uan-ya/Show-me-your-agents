# Workflow state restoration

## Root causes found

The selected client was stored outside the URL, so a direct page link could not
fully identify its business context. Analysis results were also held primarily
in `App` React state and a browser cache. `Insights` copied its initial props on
mount, but did not reliably consume a later backend hydration. Consequently,
opening or refreshing Insights could render an empty prerequisite state before
the latest analysis was known.

`CampaignPlan` treated brief and insight prop changes as a reason to reset its
generation state. Those props are restored asynchronously, so a valid saved
campaign could be cleared while the page was loading. Dataset selection and
some failed API requests also cleared visible results even though no persisted
business record had been deleted.

There was no single persisted workflow summary. Each page inferred readiness
from whatever happened to be in React memory, which made guidance dependent on
the order in which pages had been visited.

## Source of truth after the fix

Client-scoped URLs use `#/clients/{client_id}/{view}`. The backend owns the
Marketing Brief, datasets, completed analysis runs, insights, campaigns,
approvals and dated schedule items. On client selection, refresh or direct
navigation, the app loads:

1. `GET /api/clients/{client_id}/workflow-status`
2. `GET /api/clients/{client_id}/analyses/latest`
3. each page's existing client-scoped records, such as campaigns or calendar
   items

React state is the current rendered snapshot. Local storage is retained only as
a scoped draft/cache and is never preferred over a successful backend read.
Marketing Brief edits are marked dirty locally, debounced, then upserted to the
backend. A failed save keeps the local draft and exposes a retry action.

## Navigation and isolation rules

- Navigation changes the view without resetting client business data.
- Restoration shows loading before deciding that a prerequisite is missing.
- API failures preserve already visible/cached data and expose retry controls.
- A client change immediately replaces page-local state, then reloads only the
  new client's backend records.
- Saved campaigns render even when their originating insights are not present
  in current React memory.
- Workflow progress and the recommended next step are calculated from persisted
  records, not hard-coded page order.
