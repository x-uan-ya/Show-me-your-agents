import {
  CATEGORY_LABELS,
  type CustomerSignal,
  type Insight,
} from "../types";
import { confidenceBadgeClass, looksSynthetic } from "../utils/format";

interface Props {
  insight: Insight;
  signalsById: Map<number, CustomerSignal>;
  onClose: () => void;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

// Slide-over panel answering: "What evidence caused the system to make this
// interpretation?" Shows the insight, a concise user-facing rationale (NOT raw
// model chain-of-thought), and each supporting piece of original customer
// feedback with source / date / rating / product when available.
export function EvidenceDrawer({ insight, signalsById, onClose }: Props) {
  const hasEvidence = insight.evidence.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close evidence panel"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 text-slate-100 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-300">
              {CATEGORY_LABELS[insight.category] ?? insight.category}
            </p>
            <h3 className="mt-1 text-xl font-semibold">{insight.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(
              insight.confidence_label,
            )}`}
          >
            {insight.confidence_label} confidence
          </span>
          <span className="text-xs text-slate-400">
            {insight.evidence_count} evidence item
            {insight.evidence_count === 1 ? "" : "s"}
          </span>
        </div>

        <section className="mt-5">
          <h4 className="text-sm font-semibold text-slate-200">Summary</h4>
          <p className="mt-1 text-sm text-slate-300">{insight.summary}</p>
        </section>

        {insight.reasoning_summary && (
          <section className="mt-5">
            <h4 className="text-sm font-semibold text-slate-200">
              Why the system reached this
            </h4>
            {/* User-facing rationale grounded in evidence, not hidden model
                chain-of-thought. */}
            <p className="mt-1 text-sm text-slate-300">
              {insight.reasoning_summary}
            </p>
          </section>
        )}

        <section className="mt-6">
          <h4 className="text-sm font-semibold text-slate-200">
            Supporting customer feedback
          </h4>

          {!hasEvidence ? (
            <p className="mt-2 rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-300">
              No supporting evidence is attached to this insight. Treat it with
              caution: it should not be relied on without evidence.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {insight.evidence.map((ev) => {
                const signal = signalsById.get(ev.signal_id);
                const date = signal ? formatDate(signal.date) : null;
                const synthetic = signal ? looksSynthetic(signal) : false;
                return (
                  <li
                    key={ev.signal_id}
                    className="rounded border border-slate-800 bg-slate-900 p-3"
                  >
                    <p className="text-sm text-slate-200">
                      &ldquo;{signal?.text ?? ev.excerpt}&rdquo;
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      {signal?.source && <span>Source: {signal.source}</span>}
                      {date && <span>Date: {date}</span>}
                      {signal?.rating != null && (
                        <span>Rating: {signal.rating}</span>
                      )}
                      {signal?.product && <span>Product: {signal.product}</span>}
                      {synthetic && (
                        <span className="rounded bg-fuchsia-900/60 px-1.5 py-0.5 font-medium text-fuchsia-200">
                          SYNTHETIC DEV DATA
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
