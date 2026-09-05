import { useEffect, useState } from "react";

import { api } from "../api/client";
import {
  EVIDENCE_FLAG_LABELS,
  type EvidenceQuality,
} from "../types";

interface Props {
  insightId: number;
}

function statusClass(status: string): string {
  switch (status) {
    case "OK":
      return "bg-emerald-900/60 text-emerald-200 border border-emerald-700";
    case "INSUFFICIENT":
      return "bg-red-900/60 text-red-200 border border-red-700";
    default:
      return "bg-amber-900/60 text-amber-200 border border-amber-700";
  }
}

// Fetches and renders the evidence-quality assessment for one insight:
// what the data supports, what it cannot establish, and possible limitations.
export function EvidenceQualityPanel({ insightId }: Props) {
  const [quality, setQuality] = useState<EvidenceQuality | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .evidenceQuality(insightId)
      .then((q) => {
        if (!cancelled) setQuality(q);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [insightId]);

  if (loading) {
    return <p className="text-sm text-slate-400">Assessing evidence quality...</p>;
  }
  if (error || !quality) {
    return (
      <p className="text-sm text-red-300">
        Could not load evidence quality{error ? `: ${error}` : ""}.
      </p>
    );
  }

  const sources = Object.entries(quality.source_distribution);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(
            quality.status,
          )}`}
        >
          {quality.status}
        </span>
        {quality.flags.map((f) => (
          <span
            key={f}
            className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-200"
            title={f}
          >
            {EVIDENCE_FLAG_LABELS[f]}
          </span>
        ))}
      </div>

      {/* What the data supports */}
      <div>
        <h5 className="text-sm font-semibold text-slate-200">
          What the data supports
        </h5>
        <p className="mt-1 text-sm text-slate-300">{quality.explanation}</p>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
          <li>
            Independent supporting signals: {quality.independent_evidence_count}
          </li>
          {quality.evidence_coverage != null && (
            <li>
              Dataset coverage:{" "}
              {(quality.evidence_coverage * 100).toFixed(1)}% of analysed signals
            </li>
          )}
          {sources.length > 0 && (
            <li>
              Sources:{" "}
              {sources.map(([s, n]) => `${s} (${n})`).join(", ")}
            </li>
          )}
        </ul>
      </div>

      {/* What the data cannot establish */}
      <div>
        <h5 className="text-sm font-semibold text-slate-200">
          What the data cannot establish
        </h5>
        <p className="mt-1 text-sm text-slate-400">
          This assessment does not prove causation and does not measure actual
          customer behaviour. Confidence is a qualitative band, not a
          probability.
        </p>
      </div>

      {/* Possible limitations */}
      <div>
        <h5 className="text-sm font-semibold text-slate-200">
          Possible limitations
        </h5>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-400">
          {quality.limitations.map((lim, i) => (
            <li key={i}>{lim}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
