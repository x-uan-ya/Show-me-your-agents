// Thin API client for the backend. The base URL is configurable via env so the
// frontend is not hard-coded to any environment.

import type {
  AnalyseResponse,
  BehaviourSummary,
  Client,
  ColumnMapping,
  CustomerSignal,
  Dataset,
  EvidenceQuality,
  HealthResponse,
  ImportResult,
  InsightTypeInfo,
  UploadResponse,
} from "../types";

// Default to a relative "/api" so the app works when the backend serves the
// built frontend from the same origin (single-instance deployment). In local
// split dev, .env.development points this at the separate backend port.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // fall through to a generic message
  }
  return `Request failed: ${response.status}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => getJson<HealthResponse>("/health"),
  taxonomy: () => getJson<InsightTypeInfo[]>("/insights/taxonomy"),

  listClients: () => getJson<Client[]>("/clients"),
  createClient: (payload: { name: string; industry?: string }) =>
    postJson<Client>("/clients", payload),

  uploadDataset: async (
    clientId: number,
    file: File,
    name?: string,
  ): Promise<UploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    const response = await fetch(
      `${API_BASE_URL}/clients/${clientId}/datasets/upload`,
      { method: "POST", body: form },
    );
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    return (await response.json()) as UploadResponse;
  },

  confirmMapping: (clientId: number, datasetId: number, mapping: ColumnMapping) =>
    postJson<ImportResult>(
      `/clients/${clientId}/datasets/${datasetId}/confirm-mapping`,
      { mapping },
    ),

  listDatasets: (clientId: number) =>
    getJson<Dataset[]>(`/clients/${clientId}/datasets`),

  listSignals: (clientId: number) =>
    getJson<CustomerSignal[]>(`/clients/${clientId}/signals`),

  analyse: (clientId: number, datasetId: number) =>
    postJson<AnalyseResponse>(`/clients/${clientId}/analyse`, {
      dataset_id: datasetId,
    }),

  behaviourSummary: (clientId: number) =>
    getJson<BehaviourSummary>(`/clients/${clientId}/behaviour-summary`),

  evidenceQuality: (clientId: number, insightId: number) =>
    getJson<EvidenceQuality>(
      `/clients/${clientId}/insights/${insightId}/evidence-quality`,
    ),
};
