import { useState } from "react";

import { api } from "../api/client";
import { ClientSelector } from "../components/ClientSelector";
import type { BehaviourDriver, BehaviourSummary } from "../types";
import { confidenceBadgeClass } from "../utils/format";

type Status = "idle" | "loading" | "ready" | "error";

const CAUSATION_DISCLAIMER =
  "Available customer signals suggest behavioural patterns but do not by themselves establish causation.";

interface ColumnProps {
  heading: string;
  question: string;
  drivers: BehaviourDriver[];
  accent: string;
}

function DriverColumn({ heading, question, drivers, accent }: ColumnProps) {
  return (
    <section className="flex-1 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className={`text-sm font-bold uppercase tracking-wide ${accent}`}>
        {heading}
      </h2>
      <p className="mt-1 text-xs text-slate-400">{question}</p>

      {drivers.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No evidence-backed drivers found.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {drivers.map((d) => (
            <li
              key={d.insight_id}
              className="rounded border border-slate-800 bg-slate-950 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  {d.title}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceBadgeClass(
                    d.confidence_label,
                  )}`}
                  title="Qualitative confidence band, not a probability"
                >
                  {d.confidence_label}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">{d.summary}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                {d.evidence_count} supporting signal
                {d.evidence_count === 1 ? "" : "s"}
              </p>
              {d.evidence.length > 0 && (
                <blockquote className="mt-2 border-l-2 border-slate-700 pl-2 text-[11px] italic text-slate-400">
                  &ldquo;{d.evidence[0].excerpt}&rdquo;
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TrialVsRetention() {
  const [clientId, setClientId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BehaviourSummary | null>(null);

  const load = async (id: number) => {
    setClientId(id);
    setStatus("loading");
    setError(null);
    setSummary(null);
    try {
      const data = await api.behaviourSummary(id);
      setSummary(data);
      setStatus("ready");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Trial vs Retention
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Distinguish why customers appear to <em>try</em> an offering from why
            they appear to <em>continue</em> choosing it.
          </p>
        </div>

        {/* Always-visible causation disclaimer. */}
        <div className="rounded border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
          {CAUSATION_DISCLAIMER}
        </div>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <ClientSelector
            selectedId={clientId}
            onSelect={(id) => void load(id)}
          />
        </section>

        {status === "loading" && (
          <p className="text-sm text-slate-400">Loading behaviour summary...</p>
        )}

        {status === "error" && (
          <div className="rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            Could not load behaviour summary: {error}
          </div>
        )}

        {status === "ready" && summary && (
          <>
            <div className="flex flex-col gap-4 lg:flex-row">
              <DriverColumn
                heading="Trial"
                question="What appears to encourage initial experimentation?"
                drivers={summary.trial_drivers}
                accent="text-sky-300"
              />
              <DriverColumn
                heading="Retention"
                question="What appears to encourage continued interest?"
                drivers={summary.retention_drivers}
                accent="text-emerald-300"
              />
              <DriverColumn
                heading="Non-Repeat"
                question="What appears to prevent continued interest?"
                drivers={summary.non_repeat_drivers}
                accent="text-amber-300"
              />
            </div>

            {summary.observations.length > 0 && (
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="text-sm font-semibold text-slate-200">
                  Observations
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                  {summary.observations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-200">
                Limitations
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
                {summary.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
