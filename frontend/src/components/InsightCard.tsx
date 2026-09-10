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
  const categoryLabel = CATEGORY_LABELS[insight.category] ?? insight.category;
  const categoryMark = categoryLabel
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2);
  const strength =
    insight.confidence_label === "High"
      ? 3
      : insight.confidence_label === "Medium"
        ? 2
        : 1;

  return (
    <article className="insight-card group">
      <div className="insight-card-mark" aria-hidden="true">
        {categoryMark}
      </div>

      <div className="min-w-0 flex-1">
        <span className="insight-category">{categoryLabel}</span>
        <h3>{insight.title}</h3>
        <p>{insight.summary}</p>
      </div>

      <div className="insight-card-metrics">
        <div className="insight-confidence">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${confidenceBadgeClass(
              insight.confidence_label,
            )}`}
            title="Qualitative confidence band, not a probability"
          >
            {insight.confidence_label} confidence
          </span>
          <span className="confidence-rail" aria-hidden="true">
            {[1, 2, 3].map((segment) => (
              <i key={segment} className={segment <= strength ? "is-active" : ""} />
            ))}
          </span>
        </div>
        <span className={`evidence-count ${hasEvidence ? "" : "is-empty"}`}>
          <strong>{insight.evidence_count}</strong>
          {hasEvidence
            ? ` evidence item${insight.evidence_count === 1 ? "" : "s"}`
            : " no evidence"}
        </span>
        <button
          type="button"
          onClick={() => onViewEvidence(insight)}
          className="evidence-button"
        >
          View Evidence <span aria-hidden>→</span>
        </button>
      </div>
    </article>
  );
}
