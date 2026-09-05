# Customer Insight Intelligence

Pre-SME foundation for a system that analyses customer feedback and identifies
**evidence-backed customer needs** before campaign planning begins.

This is **not** sentiment analysis. The system classifies feedback into eight
behavioural insight categories that answer *why* customers behave as they do:

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

## Design principles

- **Data-source-independent.** No assumptions about a specific SME or dataset.
- **Provider-agnostic AI.** A single `AIProvider` interface backs mock, AWS
  Bedrock, OpenAI, or future providers. **MOCK mode is the default and needs no
  API key.**
- **Traceable.** Every insight carries a supporting evidence excerpt.

Not yet included (by design): authentication, social media integrations,
campaign planning, automatic publishing.

## Project structure

```
Show-me-your-agents/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app + CORS + routers
│   │   ├── config.py              # Pydantic settings (AI_PROVIDER, DB, CORS)
│   │   ├── database.py            # SQLAlchemy engine/session (SQLite dev)
│   │   ├── models/                # ORM: FeedbackItem, Insight
│   │   ├── schemas/               # Pydantic request/response models
│   │   ├── routers/               # health, insights (taxonomy)
│   │   ├── services/
│   │   │   ├── ingestion/         # accept + normalise feedback
│   │   │   ├── insight_engine/    # orchestrates classification pipeline
│   │   │   ├── ai/                # base, mock, bedrock, openai, factory
│   │   │   └── evidence/          # grounding of insights in source text
│   │   ├── repositories/          # data-access layer
│   │   └── utils/taxonomy.py      # the 8 behavioural insight types
│   ├── tests/                     # pytest: health + mock provider
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── api/                   # backend client (configurable base URL)
    │   ├── components/            # StatusBadge
    │   ├── pages/                 # Dashboard
    │   ├── types/                 # shared TS types
    │   ├── hooks/                 # useHealthCheck
    │   └── utils/                 # formatting helpers
    ├── package.json
    └── .env.example
```

## Running the backend

Requires Python 3.11+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # optional; defaults work in MOCK mode
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health → `{"status":"ok"}`

## Running the frontend

Requires Node.js 18+.

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

## Switching AI providers

Set `AI_PROVIDER` in `backend/.env`:

- `mock` (default) — heuristic classifier, no credentials required
- `openai` — set `OPENAI_API_KEY` and `OPENAI_MODEL` (implementation stubbed)
- `bedrock` — set `BEDROCK_REGION` and `BEDROCK_MODEL_ID` (implementation stubbed)

The Bedrock and OpenAI providers are intentionally stubbed in this foundation so
there is no hard dependency on any vendor SDK. They raise a clear error until
implemented.
```
