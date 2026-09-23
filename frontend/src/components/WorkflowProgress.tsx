import type { AppView, WorkflowNextStep, WorkflowStatus } from "../types";

type WorkflowStageKey = keyof Pick<
  WorkflowStatus,
  "client" | "brief" | "data" | "analysis" | "insights" | "campaign" | "approval" | "schedule"
>;

interface Props {
  clientName: string;
  currentView: AppView;
  status: WorkflowStatus | null;
  loading: boolean;
  error: string | null;
  onNavigate: (view: AppView) => void;
  onRetry: () => void;
}

const STAGES: Array<{
  key: WorkflowStageKey;
  label: string;
  view: AppView;
}> = [
  { key: "client", label: "Client", view: "import" },
  { key: "brief", label: "Brief", view: "import" },
  { key: "data", label: "Data", view: "import" },
  { key: "analysis", label: "Analysis", view: "insights" },
  { key: "insights", label: "Insights", view: "insights" },
  { key: "campaign", label: "Campaign", view: "campaign-plan" },
  { key: "approval", label: "Approval", view: "campaign-plan" },
  { key: "schedule", label: "Schedule", view: "campaign-calendar" },
];

const NEXT_STEP: Record<WorkflowNextStep, { label: string; action: string; view: AppView }> = {
  brief: { label: "Complete the marketing brief", action: "Open brief", view: "import" },
  data: { label: "Upload and confirm customer feedback", action: "Upload data", view: "import" },
  analysis: { label: "Run customer feedback analysis", action: "Run analysis", view: "insights" },
  campaign: { label: "Create a campaign from your insights", action: "Create campaign", view: "campaign-plan" },
  approval: { label: "Review and approve the saved campaign", action: "Review campaign", view: "campaign-plan" },
  schedule: { label: "Review the campaign publishing schedule", action: "Open calendar", view: "campaign-calendar" },
  complete: { label: "Keep the campaign schedule up to date", action: "View calendar", view: "campaign-calendar" },
};

const VIEW_STAGE: Partial<Record<AppView, WorkflowStageKey>> = {
  import: "brief",
  insights: "analysis",
  "trial-retention": "insights",
  "campaign-plan": "campaign",
  "campaign-calendar": "schedule",
};

export function WorkflowProgress({
  clientName,
  currentView,
  status,
  loading,
  error,
  onNavigate,
  onRetry,
}: Props) {
  if (loading && !status) {
    return (
      <section className="workflow-progress is-loading" role="status">
        <span className="analysis-pulse" aria-hidden />
        <p>Restoring {clientName || "client"} workflow…</p>
      </section>
    );
  }

  if (!status) {
    return (
      <section className="workflow-progress is-error" role="alert">
        <div>
          <strong>Unable to restore this client’s workflow.</strong>
          <span>{error ?? "The latest saved state could not be loaded."}</span>
        </div>
        <button type="button" className="secondary-button" onClick={onRetry}>Retry</button>
      </section>
    );
  }

  const next = NEXT_STEP[status.recommended_next_step];
  const currentStage = VIEW_STAGE[currentView];
  const completed = STAGES.filter((stage) => status[stage.key]).length;

  return (
    <section className="workflow-progress" aria-label={`${status.client_name} workflow progress`}>
      <div className="workflow-progress-heading">
        <div>
          <span>Current client</span>
          <strong>{status.client_name}</strong>
        </div>
        <div className="workflow-progress-readiness">
          <span>Campaign readiness</span>
          <strong>{Math.round((completed / STAGES.length) * 100)}%</strong>
        </div>
      </div>

      <ol className="workflow-progress-stages">
        {STAGES.map((stage) => {
          const isComplete = status[stage.key];
          const isCurrent = currentStage === stage.key;
          return (
            <li key={stage.key} className={`${isComplete ? "is-complete" : ""} ${isCurrent ? "is-current" : ""}`}>
              <button type="button" onClick={() => onNavigate(stage.view)}>
                <i aria-hidden="true">{isComplete ? "✓" : isCurrent ? "●" : "○"}</i>
                <span>{stage.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="workflow-progress-next">
        <div>
          <span>Recommended next step</span>
          <strong>{next.label}</strong>
          {error && <small role="status">Some status details could not refresh. Saved data remains visible.</small>}
        </div>
        <button type="button" className="workflow-next-button" onClick={() => onNavigate(next.view)}>
          {next.action} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
