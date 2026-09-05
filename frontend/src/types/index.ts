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

// --- Insights & analysis ---

// The eight behavioural insight categories (UPPERCASE, matching the backend).
export const INSIGHT_CATEGORIES = [
  "PURCHASE_DRIVER",
  "TRIAL_DRIVER",
  "RETENTION_DRIVER",
  "NON_REPEAT_DRIVER",
  "PAIN_POINT",
  "UNMET_NEED",
  "CUSTOMER_ANXIETY",
  "EMERGING_DEMAND",
] as const;

export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

// Human-friendly group headings, in the order they should be displayed.
export const CATEGORY_LABELS: Record<InsightCategory, string> = {
  PURCHASE_DRIVER: "Purchase Drivers",
  TRIAL_DRIVER: "Trial Drivers",
  RETENTION_DRIVER: "Retention Drivers",
  NON_REPEAT_DRIVER: "Non-Repeat Drivers",
  PAIN_POINT: "Pain Points",
  UNMET_NEED: "Unmet Needs",
  CUSTOMER_ANXIETY: "Customer Anxieties",
  EMERGING_DEMAND: "Emerging Demand",
};

export type ConfidenceLabel = "High" | "Medium" | "Low";

export interface InsightEvidence {
  signal_id: number;
  excerpt: string;
  relevance_score: number | null;
}

export interface Insight {
  id: number;
  client_id: number;
  analysis_run_id: number;
  title: string;
  summary: string;
  category: InsightCategory;
  confidence: number;
  confidence_label: ConfidenceLabel;
  evidence_count: number;
  reasoning_summary: string | null;
  evidence: InsightEvidence[];
}

export interface AnalysisRun {
  id: number;
  client_id: number;
  dataset_id: number;
  status: string;
  model_provider: string;
  model_name: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface AnalyseResponse {
  analysis_run: AnalysisRun;
  insights: Insight[];
  rejected: string[];
}

// Full customer signal, used to enrich evidence with source/date/rating/product.
export interface CustomerSignal {
  id: number;
  client_id: number;
  dataset_id: number;
  external_id: string | null;
  source: string | null;
  date: string | null;
  text: string;
  rating: number | null;
  product: string | null;
  campaign: string | null;
  channel: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Dataset {
  id: number;
  client_id: number;
  name: string;
  source_type: string;
  filename: string | null;
  record_count: number;
  uploaded_at: string;
  status: string;
}

// --- Trial vs Retention behaviour summary ---

export interface BehaviourEvidence {
  signal_id: number;
  excerpt: string;
}

export interface BehaviourDriver {
  insight_id: number;
  title: string;
  summary: string;
  confidence: number;
  confidence_label: ConfidenceLabel;
  evidence_count: number;
  evidence: BehaviourEvidence[];
}

export interface BehaviourSummary {
  trial_drivers: BehaviourDriver[];
  retention_drivers: BehaviourDriver[];
  non_repeat_drivers: BehaviourDriver[];
  observations: string[];
  limitations: string[];
}
