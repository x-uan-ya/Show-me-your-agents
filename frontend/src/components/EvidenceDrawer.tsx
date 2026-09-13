import { useEffect, useId, useRef } from "react";

import {
  CATEGORY_LABELS,
  type CustomerSignal,
  type Insight,
} from "../types";
import { confidenceBadgeClass, looksSynthetic } from "../utils/format";
import { EvidenceQualityPanel } from "./EvidenceQualityPanel";

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
  const titleId = useId();
  const summaryId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    openerRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="evidence-backdrop"
        aria-hidden="true"
        onMouseDown={onClose}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        tabIndex={-1}
        className="evidence-drawer"
      >
        <div className="evidence-drawer-header">
          <div>
            <p className="section-kicker">
              {CATEGORY_LABELS[insight.category] ?? insight.category}
            </p>
            <h3 id={titleId} className="mt-1 text-xl font-semibold">{insight.title}</h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="drawer-close"
          >
            <span aria-hidden>×</span>
            <span className="sr-only">Close evidence panel</span>
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
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
          <p id={summaryId} className="mt-2 text-sm leading-6 text-slate-300">{insight.summary}</p>
        </section>

        {insight.reasoning_summary && (
          <section className="mt-5">
            <h4 className="text-sm font-semibold text-slate-200">
              Why the system reached this
            </h4>
            {/* User-facing rationale grounded in evidence, not hidden model
                chain-of-thought. */}
            <p className="mt-2 text-sm leading-6 text-slate-300">
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
                    className="evidence-source-card"
                  >
                    <blockquote className="text-sm leading-6 text-slate-200">
                      &ldquo;{signal?.text ?? ev.excerpt}&rdquo;
                    </blockquote>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      {signal?.source && <span>Source: {signal.source}</span>}
                      {date && <time dateTime={signal?.date ?? undefined}>Date: {date}</time>}
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

        <section className="mt-6 border-t border-slate-800 pt-5">
          <h4 className="text-sm font-semibold text-slate-200">
            Evidence quality
          </h4>
          <div className="mt-3">
            <EvidenceQualityPanel
              clientId={insight.client_id}
              insightId={insight.id}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
