// Shared frontend types. Kept aligned with the backend schemas but independent
// of any specific dataset or SME.

export interface HealthResponse {
  status: string;
}

export type UserRole = "admin" | "strategist" | "reviewer" | "viewer";

export interface WorkspaceSummary {
  id: number;
  name: string;
  role: UserRole;
}

export interface CurrentUser {
  id: number;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  workspace_id: number;
  workspace_name: string;
  workspaces: WorkspaceSummary[];
}

export interface AuthMessage {
  message: string;
}

export type ClientRole = "strategist" | "reviewer" | "viewer";

export interface WorkspaceMember {
  user_id: number;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface ClientMember {
  user_id: number;
  client_id: number;
  role: ClientRole;
  is_active: boolean;
}

export interface InsightTypeInfo {
  type: string;
  label: string;
  question: string;
  description: string;
}

export type ConnectionState = "checking" | "connected" | "error";

export type AppView =
  | "dashboard"
  | "import"
  | "insights"
  | "campaign-plan"
  | "trial-retention"
  | "campaign-calendar"
  | "team-access";

export interface MarketingBrief {
  objective: string;
  target_audience: string;
  channels: string[];
  current_message: string;
}

export interface MarketingBriefRecord extends MarketingBrief {
  id: number;
  client_id: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignContentItemInput {
  channel: string;
  content: string;
  content_type?: string | null;
  cta?: string | null;
  sequence_day?: number | null;
  publish_date?: string | null;
  owner?: string | null;
  status?: "draft" | "scheduled" | "published" | "cancelled";
}

export interface CampaignCreateInput {
  marketing_brief_id: number;
  analysis_run_id?: number | null;
  primary_insight_id?: number | null;
  supporting_insight_ids: number[];
  name: string;
  key_message: string;
  message_gap?: string | null;
  cta: string;
  kpi: string;
  status?: "draft" | "approved" | "revision_requested";
  start_date?: string | null;
  end_date?: string | null;
  strategy_payload: Record<string, unknown>;
  content_items: CampaignContentItemInput[];
}

export interface CampaignGenerateInput {
  marketing_brief_id: number;
  analysis_run_id?: number | null;
  primary_insight_id?: number | null;
  supporting_insight_ids: number[];
  start_date?: string | null;
  gap?: CampaignGapResponse | null;
}

export interface PersistedCampaignContentItem extends CampaignContentItemInput {
  id: number;
  campaign_id: number;
  status: "draft" | "scheduled" | "published" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface CampaignCalendarItem {
  id: number;
  campaign_id: number;
  campaign_name: string;
  campaign_status: string;
  client_id: number;
  client_name: string;
  channel: string;
  publish_date: string;
  status: "draft" | "scheduled" | "published" | "cancelled";
  content: string;
  content_type: string | null;
  cta: string | null;
  owner: string | null;
}

export interface CampaignApproval {
  id: number;
  campaign_id: number;
  status: string;
  reviewer: string | null;
  revision_comment: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignPrimaryInsight {
  id: number;
  analysis_run_id: number;
  title: string;
  summary: string;
  confidence: number;
  evidence_count: number;
}

export interface PersistedCampaign {
  id: number;
  client_id: number;
  marketing_brief_id: number;
  analysis_run_id: number | null;
  primary_insight_id: number | null;
  supporting_insight_ids: number[];
  primary_insight: CampaignPrimaryInsight | null;
  name: string;
  objective: string;
  target_audience: string;
  key_message: string;
  message_gap: string | null;
  cta: string;
  kpi: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  strategy_payload: Record<string, unknown>;
  content_items: PersistedCampaignContentItem[];
  approval: CampaignApproval | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignGenerationResponse {
  campaign: PersistedCampaign;
  gap: CampaignGapResponse;
}

export interface CampaignParameter {
  campaign_id: string;
  objective: string;
  target_audience: string;
  active_message: string;
  channel: string;
}

export interface CampaignGapResponse {
  client_id: number;
  campaign: CampaignParameter;
  analysis: {
    alignment: "aligned" | "partial" | "misaligned";
    summary: string;
    matched_customer_values: string[];
    message_gaps: string[];
    recommended_actions: string[];
    supporting_insight_ids: number[];
  };
}

export const EMPTY_MARKETING_BRIEF: MarketingBrief = {
  objective: "",
  target_audience: "",
  channels: [],
  current_message: "",
};

export interface Client {
  id: number;
  workspace_id?: number | null;
  name: string;
  industry: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkflowNextStep =
  | "brief"
  | "data"
  | "analysis"
  | "campaign"
  | "approval"
  | "schedule"
  | "complete";

export interface WorkflowStatus {
  client_id: number;
  client_name: string;
  client: boolean;
  brief: boolean;
  data: boolean;
  analysis: boolean;
  insights: boolean;
  campaign: boolean;
  approval: boolean;
  schedule: boolean;
  latest_dataset_id: number | null;
  latest_analysis_run_id: number | null;
  latest_campaign_id: number | null;
  insight_count: number;
  scheduled_item_count: number;
  recommended_next_step: WorkflowNextStep;
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

// --- Evidence quality ---

export type EvidenceFlag =
  | "LIMITED_EVIDENCE"
  | "SMALL_SAMPLE"
  | "SOURCE_CONCENTRATION"
  | "CONFLICTING_SIGNALS"
  | "LIMITED_CONTEXT";

export type EvidenceQualityStatus = "OK" | "CAUTION" | "INSUFFICIENT";

export interface EvidenceQuality {
  insight_id: number;
  status: EvidenceQualityStatus;
  confidence: number;
  confidence_label: ConfidenceLabel;
  evidence_count: number;
  independent_evidence_count: number;
  evidence_coverage: number | null;
  source_distribution: Record<string, number>;
  flags: EvidenceFlag[];
  explanation: string;
  limitations: string[];
}

// Human-friendly descriptions for each evidence flag (frontend copy).
export const EVIDENCE_FLAG_LABELS: Record<EvidenceFlag, string> = {
  LIMITED_EVIDENCE: "Limited evidence",
  SMALL_SAMPLE: "Small sample",
  SOURCE_CONCENTRATION: "Source concentration",
  CONFLICTING_SIGNALS: "Conflicting signals",
  LIMITED_CONTEXT: "Limited context",
};
