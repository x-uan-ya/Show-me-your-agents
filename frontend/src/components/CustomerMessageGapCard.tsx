import { useId } from "react";

import type { CampaignGapResponse, Insight } from "../types";

interface Props {
  gap: CampaignGapResponse;
  insights: Insight[];
  onViewEvidence: (insight: Insight) => void;
}

export function CustomerMessageGapCard({ gap, insights, onViewEvidence }: Props) {
  const titleId = useId();
  const supportingIds = [...new Set(gap.analysis.supporting_insight_ids)];
  const alignmentClass = {
    aligned: "border-emerald-700 bg-emerald-900/60 text-emerald-200",
    partial: "border-amber-700 bg-amber-900/60 text-amber-200",
    misaligned: "border-red-700 bg-red-900/60 text-red-200",
  }[gap.analysis.alignment];

  return (
    <article aria-labelledby={titleId} className="surface-card recommendation-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-xl font-semibold text-white">Customer-Message Gap</h2>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${alignmentClass}`}>
          Alignment: {gap.analysis.alignment}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Pursue <strong>{gap.campaign.objective}</strong> for {gap.campaign.target_audience}.
      </p>
      <section className="mt-5">
        <h3 className="section-kicker">Active campaign message</h3>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
          {gap.campaign.active_message || "No active campaign message provided."}
        </p>
      </section>
      <section className="mt-5">
        <h3 className="section-kicker">Analysis summary</h3>
        <p className="mt-2 break-words text-sm leading-6 text-slate-300">{gap.analysis.summary}</p>
      </section>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {[
          { title: "Matched customer values", items: gap.analysis.matched_customer_values },
          { title: "Message gaps", items: gap.analysis.message_gaps },
          { title: "Recommended actions", items: gap.analysis.recommended_actions },
        ].map(({ title, items }) => (
          <section key={title}>
            <h3 className="section-kicker">{title}</h3>
            {items.length > 0 ? (
              <ul className="mt-2 list-disc space-y-2 break-words pl-5 text-sm leading-6 text-slate-300">
                {items.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-400">None identified.</p>
            )}
          </section>
        ))}
      </div>
      <section className="mt-6 border-t border-slate-800 pt-5">
        <h3 className="section-kicker">Supporting insights</h3>
        <p className="mt-2 text-sm text-slate-400">Citations support the overall analysis.</p>
        {supportingIds.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-3">
            {supportingIds.map((id) => {
              const insight = insights.find((item) => item.id === id && item.client_id === gap.client_id);
              return (
                <li key={id} className="min-w-0 max-w-full">
                  {insight ? (
                    <button
                      type="button"
                      className="evidence-button max-w-full break-words text-left"
                      onClick={() => onViewEvidence(insight)}
                    >
                      View evidence for Insight #{id}: {insight.title}
                    </button>
                  ) : (
                    <span className="data-chip">Insight #{id} — unavailable</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">No supporting insights provided.</p>
        )}
      </section>
    </article>
  );
}
