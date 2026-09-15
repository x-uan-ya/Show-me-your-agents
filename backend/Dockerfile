# Combined image: builds the frontend and serves it from the FastAPI backend
# (single origin, single container). Build from the REPO ROOT so both
# frontend/ and backend/ are in the build context:
#
#   docker build -t multiminds-app -f backend/Dockerfile .
#
# ---------- Stage 1: build the frontend ----------
FROM node:20-slim AS frontend
WORKDIR /frontend

# Same-origin API path: the backend serves /api on the same host.
ENV VITE_API_BASE_URL=/api

# Install deps first for layer caching.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build
# Produces /frontend/dist

# ---------- Stage 2: backend + built frontend ----------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install backend dependencies first (cached unless requirements change).
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source.
COPY backend/ ./

# Built frontend from stage 1, served by FastAPI from this path.
COPY --from=frontend /frontend/dist /app/frontend_dist
ENV FRONTEND_DIST_DIR=./frontend_dist \
    SERVE_FRONTEND=true

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Secrets (e.g. LLM_GATEWAY_API_KEY) are provided at runtime via environment
# variables, never baked into the image.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
