import { useEffect, useState, type CSSProperties } from "react";

import { api, isAbortError } from "../api/client";
import { ClientSelector } from "../components/ClientSelector";
import type { BehaviourDriver, BehaviourSummary } from "../types";
import { confidenceBadgeClass } from "../utils/format";

type Status = "idle" | "loading" | "ready" | "error";

const CAUSATION_DISCLAIMER =
  "Customer signals suggest behavioural patterns but do not establish causation.";

const JOURNEY_STAGES = [
  ["Trial", "First try", "trial"],
  ["Retention", "Keeps choosing", "retention"],
  ["Non-Repeat", "Does not return", "non-repeat"],
] as const;

interface Props {
  clientId: number | null;
  onClientChange: (id: number | null) => void;
}

interface ColumnProps {
  heading: string;
  question: string;
  drivers: BehaviourDriver[];
  accent: string;
  tone: "trial" | "retention" | "risk";
}

function DriverColumn({ heading, question, drivers, accent, tone }: ColumnProps) {
  return (
    <section className={`surface-card driver-column is-${tone} flex-1 p-5`}>
      <div className="driver-column-heading">
        <span className="driver-column-mark" aria-hidden="true">
          {tone === "trial" ? "01" : tone === "retention" ? "02" : "03"}
        </span>
        <div>
          <h2 className={`text-sm font-bold uppercase tracking-[0.16em] ${accent}`}>
            {heading}
          </h2>
          <p className="mt-1 text-sm text-slate-400">{question}</p>
        </div>
      </div>

      <div className="driver-count">
        <strong>{drivers.length}</strong>
        <span>evidence-backed driver{drivers.length === 1 ? "" : "s"}</span>
      </div>

      {drivers.length === 0 ? (
        <p className="mt-5 text-sm text-slate-400">No evidence-backed drivers found.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {drivers.map((driver) => (
            <li key={driver.insight_id} className="driver-item">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{driver.title}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(driver.confidence_label)}`}
                  title="Qualitative confidence band, not a probability"
                >
                  {driver.confidence_label}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{driver.summary}</p>
              <p className="mt-3 text-xs text-slate-400">
                {driver.evidence_count} supporting signal{driver.evidence_count === 1 ? "" : "s"}
              </p>
              {driver.evidence.length > 0 && (
                <blockquote className="mt-2 border-l-2 border-cyan-800 pl-3 text-xs italic leading-5 text-slate-400">
                  “{driver.evidence[0].excerpt}”
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TrialVsRetention({ clientId, onClientChange }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BehaviourSummary | null>(null);

  const stageCounts = summary
    ? [summary.trial_drivers.length, summary.retention_drivers.length, summary.non_repeat_drivers.length]
    : [0, 0, 0];
  const maxStageCount = Math.max(...stageCounts);
  const strongestStage = maxStageCount > 0
    ? stageCounts.reduce((strongest, count, index) => count >= stageCounts[strongest] ? index : strongest, 0)
    : -1;
  const journeyProgress = strongestStage < 0 ? 0 : [12, 50, 88][strongestStage];

  useEffect(() => {
    setSummary(null);
    setError(null);
    if (clientId === null) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    api
      .behaviourSummary(clientId, controller.signal)
      .then((data) => {
        setSummary(data);
        setStatus("ready");
      })
      .catch((reason) => {
        if (isAbortError(reason)) return;
        setError((reason as Error).message);
        setStatus("error");
      });
    return () => controller.abort();
  }, [clientId]);

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Secondary diagnostic</p>
            <h1>Trial vs retention</h1>
            <p>Compare what appears to drive first use, continued choice and non-repeat behaviour.</p>
          </div>
        </header>

        <div className="evidence-disclaimer">
          <span aria-hidden="true">i</span>
          {CAUSATION_DISCLAIMER}
        </div>

        <section className="surface-card analysis-control-panel p-5 sm:p-6">
          <ClientSelector selectedId={clientId} onSelect={onClientChange} disabled={status === "loading"} />
        </section>

        <section className="journey-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Customer journey</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">From first try to next choice</h2>
            </div>
            <span className="text-sm text-slate-400">3 stages</span>
          </div>
          <div className={`journey-track ${summary ? "has-analysis" : ""}`} aria-label="Trial, Retention, and Non-Repeat stages">
            <div className={`journey-line ${summary ? "is-analysed" : ""}`}>
              <span className="journey-line-fill" style={{ width: `${journeyProgress}%` }} />
            </div>
            {JOURNEY_STAGES.map(([label, caption, tone], index) => {
              const count = stageCounts[index];
              const scale = summary && maxStageCount > 0 ? 0.68 + (count / maxStageCount) * 0.55 : 1;
              const opacity = summary && maxStageCount > 0 ? 0.24 + (count / maxStageCount) * 0.76 : 1;
              return (
              <div className="journey-stage" key={label}>
                <span
                  className={`journey-dot ${tone} ${summary ? "is-analysed" : ""}`}
                  style={{ "--journey-scale": scale, "--journey-opacity": opacity } as CSSProperties}
                  title={summary ? `${label}: ${count} driver${count === 1 ? "" : "s"}` : undefined}
                />
                <strong>{label}</strong>
                <span>{caption}</span>
              </div>
              );
            })}
          </div>
        </section>

        {status === "idle" && (
          <p className="surface-card p-7 text-center text-sm text-slate-400">Select a client to load its behavioural summary.</p>
        )}
        {status === "loading" && (
          <div role="status" className="analysis-progress"><span className="analysis-pulse" aria-hidden /><p className="text-sm text-slate-300">Loading behaviour summary…</p></div>
        )}
        {status === "error" && error && (
          <div role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">Could not load behaviour summary: {error}</div>
        )}

        {status === "ready" && summary && (
          <>
            <div className="grid gap-4 xl:grid-cols-3">
              <DriverColumn heading="Trial" question="What appears to encourage initial experimentation?" drivers={summary.trial_drivers} accent="text-cyan-300" tone="trial" />
              <DriverColumn heading="Retention" question="What appears to encourage continued interest?" drivers={summary.retention_drivers} accent="text-emerald-300" tone="retention" />
              <DriverColumn heading="Non-repeat" question="What appears to prevent continued interest?" drivers={summary.non_repeat_drivers} accent="text-amber-300" tone="risk" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {summary.observations.length > 0 && (
                <section className="trial-note">
                  <p className="trial-note-bubble">What stands out</p>
                  <h2 className="mt-3 font-semibold text-white">Observations</h2>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                    {summary.observations.map((observation, index) => <li key={index}>{observation}</li>)}
                  </ul>
                </section>
              )}

              <section className="trial-note">
                <p className="trial-note-bubble">Read with care</p>
                <h2 className="mt-3 font-semibold text-white">Limitations</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                  {summary.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
