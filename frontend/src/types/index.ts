// Shared frontend types. Kept aligned with the backend schemas but independent
// of any specific dataset or SME.

export interface HealthResponse {
  status: string;
}

export interface InsightTypeInfo {
  type: string;
  label: string;
  question: string;
  description: string;
}

export type ConnectionState = "checking" | "connected" | "error";
