// Thin API client for the backend. The base URL is configurable via env so the
// frontend is not hard-coded to any environment.

import type { HealthResponse, InsightTypeInfo } from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => getJson<HealthResponse>("/health"),
  taxonomy: () => getJson<InsightTypeInfo[]>("/insights/taxonomy"),
};
