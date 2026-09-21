import type { CSSProperties } from "react";

import {
  CATEGORY_LABELS,
  INSIGHT_CATEGORIES,
  type ConfidenceLabel,
  type Insight,
} from "../types";

interface Props {
  insights: Insight[];
}

const CONFIDENCE_BANDS: Array<{
  label: ConfidenceLabel;
  color: string;
}> = [
  { label: "High", color: "#2dd4bf" },
  { label: "Medium", color: "#43b7ff" },
  { label: "Low", color: "#8b5cf6" },
];

export function InsightCharts({ insights }: Props) {
  const categoryData = INSIGHT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    count: insights.filter((insight) => insight.category === category).length,
  })).filter((item) => item.count > 0);
  const largestCategory = Math.max(...categoryData.map((item) => item.count), 1);

  const confidenceData = CONFIDENCE_BANDS.map((band) => ({
    ...band,
    count: insights.filter(
      (insight) => insight.confidence_label === band.label,
    ).length,
  }));
  const highEnd = (confidenceData[0].count / insights.length) * 100;
  const mediumEnd =
    highEnd + (confidenceData[1].count / insights.length) * 100;
  const donutStyle: CSSProperties = {
    background: `conic-gradient(
      ${confidenceData[0].color} 0% ${highEnd}%,
      ${confidenceData[1].color} ${highEnd}% ${mediumEnd}%,
      ${confidenceData[2].color} ${mediumEnd}% 100%
    )`,
  };

  const strongestEvidence = Math.max(
    ...insights.map((insight) => insight.evidence_count),
    1,
  );

  return (
    <details className="insight-chart-section">
      <summary className="insight-chart-heading collapsible-summary">
        <div>
          <p className="section-kicker">Analysis overview</p>
          <h2 id="insight-chart-title">How the findings are distributed</h2>
        </div>
        <div className="collapse-summary-meta">
          <p>Charts count generated insights, not customers.</p>
          <span className="collapse-chevron" aria-hidden="true">⌄</span>
        </div>
      </summary>

      <div className="insight-chart-grid">
        <article className="insight-chart-card">
          <div className="insight-chart-card-heading">
            <div>
              <h3>Insight categories</h3>
              <p>Where the strongest customer patterns appear</p>
            </div>
            <span>{categoryData.length} represented</span>
          </div>
          <div className="category-chart" role="img" aria-label="Insight count by category">
            {categoryData.map((item) => (
              <div className="chart-bar-row" key={item.category}>
                <span title={item.label}>{item.label}</span>
                <div className="chart-bar-track" aria-hidden="true">
                  <i style={{ width: `${(item.count / largestCategory) * 100}%` }} />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="insight-chart-card">
          <div className="insight-chart-card-heading">
            <div>
              <h3>Confidence mix</h3>
              <p>Qualitative evidence-strength bands</p>
            </div>
          </div>
          <div className="confidence-chart">
            <div
              className="confidence-donut"
              style={donutStyle}
              role="img"
              aria-label={confidenceData
                .map((item) => `${item.label}: ${item.count}`)
                .join(", ")}
            >
              <div>
                <strong>{insights.length}</strong>
                <span>insights</span>
              </div>
            </div>
            <ul className="confidence-chart-legend">
              {confidenceData.map((item) => (
                <li key={item.label}>
                  <i style={{ background: item.color }} aria-hidden="true" />
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="insight-chart-card evidence-chart-card">
          <div className="insight-chart-card-heading">
            <div>
              <h3>Evidence depth</h3>
              <p>Supporting feedback records linked to each insight</p>
            </div>
            <span>{insights.reduce((sum, insight) => sum + insight.evidence_count, 0)} links</span>
          </div>
          <div className="evidence-depth-chart" role="img" aria-label="Evidence count for each insight">
            {insights.map((insight) => (
              <div className="evidence-depth-row" key={insight.id}>
                <span title={insight.title}>{insight.title}</span>
                <div className="evidence-depth-track" aria-hidden="true">
                  <i
                    style={{
                      width: `${(insight.evidence_count / strongestEvidence) * 100}%`,
                    }}
                  />
                </div>
                <strong>{insight.evidence_count}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </details>
  );
}
