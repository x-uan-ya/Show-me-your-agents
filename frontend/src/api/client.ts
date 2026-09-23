// Thin API client for the backend. The base URL is configurable via env so the
// frontend is not hard-coded to any environment.

import type {
  AnalyseResponse,
  AuthMessage,
  BehaviourSummary,
  CampaignCalendarItem,
  CampaignGapResponse,
  CampaignCreateInput,
  CampaignGenerateInput,
  CampaignGenerationResponse,
  Client,
  ClientMember,
  ClientRole,
  ColumnMapping,
  CurrentUser,
  CustomerSignal,
  Dataset,
  EvidenceQuality,
  HealthResponse,
  ImportResult,
  InsightTypeInfo,
  MarketingBrief,
  MarketingBriefRecord,
  PersistedCampaign,
  RegistrationOtpStatus,
  RegistrationPending,
  UploadResponse,
  UserRole,
  WorkspaceMember,
  WorkflowStatus,
} from "../types";

// Default to a relative "/api" so the app works when the backend serves the
// built frontend from the same origin (single-instance deployment). In local
// split dev, .env.development points this at the separate backend port.
function apiBaseUrl(value: string | undefined): string {
  const configured = (value?.trim() || "/api").replace(/\/+$/, "");
  if (!configured || configured === "/") return "/api";
  return configured.endsWith("/api") ? configured : `${configured}/api`;
}

const API_BASE_URL = apiBaseUrl(import.meta.env.VITE_API_BASE_URL);
export const ACTIVE_WORKSPACE_STORAGE_KEY = "customer-intelligence:auth:workspace-id";

const DEFAULT_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isRateLimitError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429;
}

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
    const headers = new Headers(init.headers);
    const workspaceId = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    if (workspaceId) headers.set("X-Workspace-ID", workspaceId);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      const parsedRetryAfter = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
      throw new ApiError(
        await parseError(response),
        response.status,
        Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0 ? parsedRetryAfter : null,
      );
    }
    if (response.status === 204) return undefined as T;
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
  register: (
    displayName: string,
    email: string,
    password: string,
    signal?: AbortSignal,
  ) => postJson<RegistrationPending>(
    "/auth/register",
    { display_name: displayName, email, password },
    signal,
  ),
  login: (email: string, password: string, signal?: AbortSignal) =>
    postJson<CurrentUser>("/auth/login", { email, password }, signal),
  requestEmailLoginCode: (email: string, signal?: AbortSignal) =>
    postJson<AuthMessage>("/auth/email-login/request", { email }, signal),
  loginWithEmailCode: (email: string, code: string, signal?: AbortSignal) =>
    postJson<CurrentUser>("/auth/email-login/verify", { email, code }, signal),
  verifyRegistrationEmail: (
    email: string,
    code: string,
    verificationToken: string,
    signal?: AbortSignal,
  ) => postJson<AuthMessage>(
    "/auth/verify-registration-email",
    { email, code, verification_token: verificationToken },
    signal,
  ),
  resendRegistrationOtp: (
    email: string,
    verificationToken: string,
    signal?: AbortSignal,
  ) => postJson<RegistrationOtpStatus>(
    "/auth/resend-registration-otp",
    { email, verification_token: verificationToken },
    signal,
  ),
  requestPasswordResetCode: (email: string, signal?: AbortSignal) =>
    postJson<AuthMessage>("/auth/password-reset/request", { email }, signal),
  confirmPasswordReset: (
    email: string,
    code: string,
    newPassword: string,
    signal?: AbortSignal,
  ) => postJson<AuthMessage>(
    "/auth/password-reset/confirm",
    { email, code, new_password: newPassword },
    signal,
  ),
  currentUser: (signal?: AbortSignal) =>
    getJson<CurrentUser>("/auth/me", signal),
  switchWorkspace: (workspaceId: number, signal?: AbortSignal) =>
    postJson<CurrentUser>("/auth/workspace", { workspace_id: workspaceId }, signal),
  logout: (signal?: AbortSignal) =>
    requestJson<void>("/auth/logout", { method: "POST" }, signal),
  listWorkspaceMembers: (signal?: AbortSignal) =>
    getJson<WorkspaceMember[]>("/workspaces/current/members", signal),
  addWorkspaceMember: (
    email: string,
    role: UserRole,
    signal?: AbortSignal,
  ) => postJson<WorkspaceMember>(
    "/workspaces/current/members",
    { email, role },
    signal,
  ),
  removeWorkspaceMember: (userId: number, signal?: AbortSignal) =>
    requestJson<void>(
      `/workspaces/current/members/${userId}`,
      { method: "DELETE" },
      signal,
    ),
  listClientMembers: (clientId: number, signal?: AbortSignal) =>
    getJson<ClientMember[]>(
      `/workspaces/current/clients/${clientId}/members`,
      signal,
    ),
  assignClientMember: (
    clientId: number,
    userId: number,
    role: ClientRole,
    signal?: AbortSignal,
  ) => putJson<ClientMember>(
    `/workspaces/current/clients/${clientId}/members/${userId}`,
    { role },
    signal,
  ),
  revokeClientMember: (
    clientId: number,
    userId: number,
    signal?: AbortSignal,
  ) => requestJson<void>(
    `/workspaces/current/clients/${clientId}/members/${userId}`,
    { method: "DELETE" },
    signal,
  ),

  health: (signal?: AbortSignal) => getJson<HealthResponse>("/health", signal),
  taxonomy: (signal?: AbortSignal) =>
    getJson<InsightTypeInfo[]>("/insights/taxonomy", signal),

  listClients: (signal?: AbortSignal) => getJson<Client[]>("/clients", signal),
  getClient: (clientId: number, signal?: AbortSignal) =>
    getJson<Client>(`/clients/${clientId}`, signal),
  getWorkflowStatus: (clientId: number, signal?: AbortSignal) =>
    getJson<WorkflowStatus>(`/clients/${clientId}/workflow-status`, signal),
  createClient: (
    payload: { name: string; industry?: string },
    signal?: AbortSignal,
  ) => postJson<Client>("/clients", payload, signal),
  deleteClient: (clientId: number, signal?: AbortSignal) =>
    requestJson<void>(`/clients/${clientId}`, { method: "DELETE" }, signal),

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

  latestAnalysis: (clientId: number, signal?: AbortSignal) =>
    getJson<AnalyseResponse | null>(
      `/clients/${clientId}/analyses/latest`,
      signal,
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

  generateCampaign: (
    clientId: number,
    payload: CampaignGenerateInput,
    signal?: AbortSignal,
  ) =>
    postJson<CampaignGenerationResponse>(
      `/clients/${clientId}/campaigns/generate`,
      payload,
      signal,
      120_000,
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

  updateCalendarItemStatus: (
    itemId: number,
    status: CampaignCalendarItem["status"],
    signal?: AbortSignal,
  ) =>
    patchJson<CampaignCalendarItem>(
      `/calendar/${itemId}/status`,
      { status },
      signal,
    ),

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
