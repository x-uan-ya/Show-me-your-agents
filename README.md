# Customer Insight Intelligence

A component of our **NUS-ISS "Show Me Your Agents" Hackathon** solution.

## Vision

Marketing agencies manage many SME clients at once, each with different
objectives, audiences, channels and schedules. Producing campaign ideas,
content calendars and publishing schedules for all of them is heavily manual
and slow. The broader product we are building is a **Marketing Campaign
Planning** assistant that reduces that manual effort.

The problem is that campaigns are often built on assumptions about what
customers want. Our differentiator is to add a **Customer Insight
Intelligence** stage *before* campaign planning, so that campaigns are grounded
in evidence about what customers actually value, hesitate over, or ask for.

This repository currently contains the Customer Insight Intelligence stage.

## Beyond Sentiment Analysis

Sentiment analysis tells you whether feedback is positive or negative. That is
not enough to plan a campaign. We care about the *why* behind customer
behaviour, and we classify feedback into eight behavioural categories:

| Category | Question it answers |
| --- | --- |
| Purchase Driver | Why did someone buy? |
| Trial Driver | Why did someone try only once? |
| Retention Driver | Why did someone return? |
| Non-Repeat Driver | Why did someone not return? |
| Pain Point | What problem is repeatedly appearing? |
| Unmet Need | What do customers want that may be unaddressed? |
| Customer Anxiety | What worries block customer confidence? |
| Emerging Demand | What new expectation or trend is appearing? |

Every insight is tied to a supporting excerpt from the source feedback, so a
claim can always be traced back to evidence.

## Trial vs Retention

High trial activity is easy to mistake for strong demand. A spike in first-time
purchases can be driven by a discount, a one-off campaign, or curiosity, and
none of those guarantee that customers come back. Long-term demand shows up in
retention, not trials.

Separating **Trial Drivers** from **Retention Drivers** lets us ask whether the
reasons people try something are the same reasons they stay. When they diverge,
a campaign that only amplifies trial drivers can grow acquisition while doing
nothing for retention.

## Customer-Message Gap Detection (planned)

A planned analysis stage that compares what a business *promotes* with what its
customers actually *value or worry about*. Where the two diverge, the marketing
message and the customer reality are misaligned, which is a strong signal for
where a campaign should focus.

This stage is not implemented yet. It is described here as intended direction,
not as a current feature.

## System architecture

Current implementation:

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, Recharts.
- **Backend:** FastAPI, Pydantic, SQLAlchemy, SQLite for local development.
- **AI layer:** a provider-agnostic `AIProvider` interface. `MockAIProvider`
  is the only fully implemented provider today.

Intended target deployment (not yet implemented):

- React/Vite frontend hosted on **Vercel**.
- FastAPI backend hosted on **AWS Lightsail**.
- Backend calls the **hackathon-provided JSON AI API**, which is backed by
  **AWS Bedrock (Claude Sonnet 4.5)**, for classification in production.

No deployment has been set up yet, and the Bedrock-backed path is not wired up
in code. The system runs locally today using the mock provider.

### AI provider abstraction

The backend depends only on the `AIProvider` interface, never on a specific
vendor SDK. A factory selects the concrete provider from configuration:

- **MockAIProvider** — a local development and testing provider that classifies
  feedback with transparent heuristics. It requires no credentials and avoids
  unnecessary model calls while building and testing the pipeline.
- **Bedrock provider** — the intended production path via the hackathon AWS
  Bedrock API. Present as an interface implementation but **stubbed**: it raises
  a clear error until it is implemented.

## Project structure

```
Show-me-your-agents/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, routers
│   │   ├── config.py        # settings (AI provider, DB, CORS)
│   │   ├── models/          # FeedbackItem, Insight
│   │   ├── routers/         # health, insight taxonomy
│   │   ├── services/        # ingestion, insight_engine, ai, evidence
│   │   └── utils/taxonomy.py# the 8 behavioural insight categories
│   └── tests/               # pytest: health + mock provider
└── frontend/
    └── src/                 # api client, Dashboard page, health hook
```

## Running the backend

Requires Python 3.11 or newer.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # optional; defaults work with the mock provider
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health returns `{"status":"ok"}`

## Running the frontend

Requires Node.js 18 or newer.

```powershell
cd frontend
npm install
copy .env.example .env        # optional; defaults to http://localhost:8000/api
npm run dev
```

Open http://localhost:5173. With the backend running you should see
**"Customer Insight Intelligence"** and **"System Connected"**.

## Running tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

## Development roadmap

Only items marked done exist in the repository today.

**Phase 1 — Customer Intelligence**
- [x] Provider-agnostic `AIProvider` interface with a working mock provider
- [x] Eight behavioural insight categories with evidence grounding
- [x] Feedback and insight data models, ingestion and insight-engine services
- [x] Health endpoint and taxonomy endpoint
- [x] Frontend dashboard that confirms connectivity and shows the taxonomy
- [ ] Trial vs Retention comparison logic
- [ ] Customer-Message Gap Detection

**Phase 2 — SME Integration**
- [ ] Ingest real SME customer feedback once a dataset is confirmed
- [ ] Per-client data separation

**Phase 3 — Campaign Intelligence**
- [ ] Campaign idea, content calendar and schedule generation
- [ ] Insight-to-campaign linkage

**Phase 4 — Evaluation & Deployment**
- [ ] Wire the Bedrock-backed hackathon AI API
- [ ] Deploy frontend to Vercel and backend to AWS Lightsail
- [ ] Evaluation of insight quality

## Security principles

- **Customer content is untrusted input.** Feedback text is treated as data,
  never as instructions to the system or the model.
- **Evidence grounding.** Every insight references a supporting excerpt so
  claims remain traceable to their source.
- **Client data isolation.** SME client data must be kept separate; no dataset
  is assumed or mixed in the current foundation.
- **Human approval for high-impact actions.** Publishing or other high-impact
  steps are intended to require human review, not automatic execution.
- **No API keys exposed to the frontend.** AI credentials and provider calls
  stay on the backend; the frontend only talks to our own API.

## Limitations

This system works with qualitative customer feedback. That kind of evidence can
surface *why* customers say they behave as they do, recurring themes, and
apparent gaps between messaging and customer concerns. It can guide where to
look and what to test.

It cannot, on its own, establish causation, measure true market size, or
guarantee that a stated reason is the real driver of behaviour. Feedback is
also subject to who chose to leave it, so it may not represent all customers.
Insights should be treated as evidence-backed hypotheses to inform campaign
decisions, not as proven business outcomes.
