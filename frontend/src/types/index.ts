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

export interface Client {
  id: number;
  name: string;
  industry: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Canonical ingestion fields. `text` is required; the rest are optional.
export const CANONICAL_FIELDS = [
  "text",
  "external_id",
  "date",
  "rating",
  "product",
  "campaign",
  "channel",
  "source",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

// canonical field -> source column name
export type ColumnMapping = Partial<Record<CanonicalField, string>>;

export interface UploadResponse {
  dataset_id: number;
  columns: string[];
  sample_rows: Record<string, string>[];
  suggested_mapping: ColumnMapping;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row?: number; issues?: string[] }[];
}
