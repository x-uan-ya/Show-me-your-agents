import { CATEGORY_LABELS, type Insight } from "../types";
import { confidenceBadgeClass } from "../utils/format";

interface Props {
  insight: Insight;
  onViewEvidence: (insight: Insight) => void;
}

// A single insight card: title, concise summary, category, confidence label,
// evidence count, and a View Evidence action.
export function InsightCard({ insight, onViewEvidence }: Props) {
  const hasEvidence = insight.evidence_count > 0;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold text-slate-100">{insight.title}</h4>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(
            insight.confidence_label,
          )}`}
          title="Qualitative confidence band, not a probability"
        >
          {insight.confidence_label} confidence
        </span>
      </div>

      <p className="text-sm text-slate-300">{insight.summary}</p>

      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-sky-300">
          {CATEGORY_LABELS[insight.category] ?? insight.category}
        </span>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs ${hasEvidence ? "text-slate-400" : "text-amber-400"}`}
          >
            {hasEvidence
              ? `${insight.evidence_count} evidence item${insight.evidence_count === 1 ? "" : "s"}`
              : "No evidence"}
          </span>
          <button
            type="button"
            onClick={() => onViewEvidence(insight)}
            className="rounded border border-slate-600 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            View Evidence
          </button>
        </div>
      </div>
    </article>
  );
}
