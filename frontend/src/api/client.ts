// Thin API client for the backend. The base URL is configurable via env so the
// frontend is not hard-coded to any environment.

import type {
  AnalyseResponse,
  BehaviourSummary,
  CampaignCalendarItem,
  CampaignGapResponse,
  CampaignCreateInput,
  Client,
  ColumnMapping,
  CustomerSignal,
  Dataset,
  EvidenceQuality,
  HealthResponse,
  ImportResult,
  InsightTypeInfo,
  MarketingBrief,
  MarketingBriefRecord,
  PersistedCampaign,
  UploadResponse,
} from "../types";

// Default to a relative "/api" so the app works when the backend serves the
// built frontend from the same origin (single-instance deployment). In local
// split dev, .env.development points this at the separate backend port.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
    /\/$/,
    "",
  );

const DEFAULT_TIMEOUT_MS = 60_000;

function errorDetail(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const messages = value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String(item.msg);
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join("; ") : null;
  }
  if (value && typeof value === "object" && "message" in value) {
    return String(value.message);
  }
  return null;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return errorDetail(body?.detail) ?? errorDetail(body?.message) ?? `Request failed: ${response.status}`;
  } catch {
    // fall through to a generic message
  }
  return `Request failed: ${response.status}`;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort(signal?.reason);

  if (signal?.aborted) relayAbort();
  else signal?.addEventListener("abort", relayAbort, { once: true });

  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await parseError(response));
    return (await response.json()) as T;
  } catch (error) {
    if (timedOut) throw new Error("Request timed out. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, {}, signal);
}

async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal,
    timeoutMs,
  );
}

async function putJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal,
  );
}

async function patchJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal,
  );
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export const api = {
  health: (signal?: AbortSignal) => getJson<HealthResponse>("/health", signal),
  taxonomy: (signal?: AbortSignal) =>
    getJson<InsightTypeInfo[]>("/insights/taxonomy", signal),

  listClients: (signal?: AbortSignal) => getJson<Client[]>("/clients", signal),
  createClient: (
    payload: { name: string; industry?: string },
    signal?: AbortSignal,
  ) => postJson<Client>("/clients", payload, signal),

  uploadDataset: async (
    clientId: number,
    file: File,
    name?: string,
    signal?: AbortSignal,
  ): Promise<UploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    return requestJson<UploadResponse>(
      `/clients/${clientId}/datasets/upload`,
      { method: "POST", body: form },
      signal,
    );
  },

  confirmMapping: (
    clientId: number,
    datasetId: number,
    mapping: ColumnMapping,
    signal?: AbortSignal,
  ) =>
    postJson<ImportResult>(
      `/clients/${clientId}/datasets/${datasetId}/confirm-mapping`,
      { mapping },
      signal,
    ),

  listDatasets: (clientId: number, signal?: AbortSignal) =>
    getJson<Dataset[]>(`/clients/${clientId}/datasets`, signal),

  listSignals: (clientId: number, signal?: AbortSignal) =>
    getJson<CustomerSignal[]>(`/clients/${clientId}/signals`, signal),

  analyse: (clientId: number, datasetId: number, signal?: AbortSignal) =>
    postJson<AnalyseResponse>(
      `/clients/${clientId}/analyse`,
      { dataset_id: datasetId },
      signal,
      120_000,
    ),

  behaviourSummary: (clientId: number, signal?: AbortSignal) =>
    getJson<BehaviourSummary>(
      `/clients/${clientId}/behaviour-summary`,
      signal,
    ),

  evidenceQuality: (
    clientId: number,
    insightId: number,
    signal?: AbortSignal,
  ) =>
    getJson<EvidenceQuality>(
      `/clients/${clientId}/insights/${insightId}/evidence-quality`,
      signal,
    ),

  analyseCampaignGapAutomatically: (
    clientId: number,
    brief: {
      objective: string;
      target_audience: string;
      active_message: string;
      channels: string[];
    },
    signal?: AbortSignal,
  ) =>
    postJson<CampaignGapResponse>(
      `/clients/${clientId}/campaign-gap/auto`,
      brief,
      signal,
      120_000,
    ),

  getMarketingBrief: (clientId: number, signal?: AbortSignal) =>
    getJson<MarketingBriefRecord | null>(
      `/clients/${clientId}/marketing-brief`,
      signal,
    ),

  saveMarketingBrief: (
    clientId: number,
    brief: MarketingBrief,
    signal?: AbortSignal,
  ) =>
    putJson<MarketingBriefRecord>(
      `/clients/${clientId}/marketing-brief`,
      brief,
      signal,
    ),

  createCampaign: (
    clientId: number,
    campaign: CampaignCreateInput,
    signal?: AbortSignal,
  ) =>
    postJson<PersistedCampaign>(
      `/clients/${clientId}/campaigns`,
      campaign,
      signal,
    ),

  listCampaigns: (clientId: number, signal?: AbortSignal) =>
    getJson<PersistedCampaign[]>(`/clients/${clientId}/campaigns`, signal),

  listCalendarItems: (
    filters: {
      clientId?: number;
      startDate?: string;
      endDate?: string;
      channel?: string;
      status?: CampaignCalendarItem["status"];
    } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    if (filters.clientId !== undefined) query.set("client_id", String(filters.clientId));
    if (filters.startDate) query.set("start_date", filters.startDate);
    if (filters.endDate) query.set("end_date", filters.endDate);
    if (filters.channel) query.set("channel", filters.channel);
    if (filters.status) query.set("status", filters.status);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return getJson<CampaignCalendarItem[]>(`/calendar${suffix}`, signal);
  },

  getCampaign: (
    clientId: number,
    campaignId: number,
    signal?: AbortSignal,
  ) =>
    getJson<PersistedCampaign>(
      `/clients/${clientId}/campaigns/${campaignId}`,
      signal,
    ),

  updateCampaignStatus: (
    clientId: number,
    campaignId: number,
    payload: {
      status: "draft" | "approved" | "revision_requested";
      reviewer?: string;
      revision_comment?: string;
    },
    signal?: AbortSignal,
  ) =>
    patchJson<PersistedCampaign>(
      `/clients/${clientId}/campaigns/${campaignId}/status`,
      payload,
      signal,
    ),
};
