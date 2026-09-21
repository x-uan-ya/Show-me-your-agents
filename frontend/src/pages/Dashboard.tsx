import { useEffect, useState } from "react";

import { api, isAbortError } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { useHealthCheck } from "../hooks/useHealthCheck";
import type { AppView, InsightTypeInfo } from "../types";

interface Props {
  selectedClientId: number | null;
  selectedClientName?: string;
  hasInsights?: boolean;
  onNavigate: (view: AppView) => void;
}

type TaxonomyState = "loading" | "ready" | "error";

type WhyIconName = "shield" | "chart" | "link" | "users";

function WhyIcon({ name }: { name: WhyIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "shield") {
    return <svg {...common}><path d="M12 3 19 6v5c0 4.7-2.9 8.1-7 10-4.1-1.9-7-5.3-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  }
  if (name === "chart") {
    return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 4-6" /><path d="M17 7h2v2" /></svg>;
  }
  if (name === "link") {
    return <svg {...common}><path d="m10 13.8-1.4 1.4a3.2 3.2 0 0 1-4.5-4.5l2.2-2.2a3.2 3.2 0 0 1 4.5 0" /><path d="m14 10.2 1.4-1.4a3.2 3.2 0 0 1 4.5 4.5l-2.2 2.2a3.2 3.2 0 0 1-4.5 0" /><path d="m8.5 15.5 7-7" /></svg>;
  }
  return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 19c.5-3 2.5-5 6-5s5.5 2 6 5" /><circle cx="17" cy="9" r="2.3" /><path d="M15 14c2.8-.2 4.7 1.4 5 4" /></svg>;
}

const WORKFLOW: Array<{
  step: string;
  title: string;
  description: string;
  action: string;
  view: AppView;
}> = [
  {
    step: "01",
    title: "Collect customer signals",
    description: "Set the SME context, define the campaign brief and import feedback.",
    action: "Set up evidence",
    view: "import",
  },
  {
    step: "02",
    title: "Interpret the evidence",
    description: "Find behavioural patterns and inspect the customer feedback behind each claim.",
    action: "Open insights",
    view: "insights",
  },
  {
    step: "03",
    title: "Shape the campaign",
    description: "Turn the brief and validated insights into strategy, ideas and a schedule.",
    action: "Build campaign",
    view: "campaign-plan",
  },
  {
    step: "04",
    title: "Plan the calendar",
    description: "Review campaign dates, channels and content direction in one calendar.",
    action: "Open calendar",
    view: "campaign-calendar",
  },
];

export function Dashboard({ selectedClientId, selectedClientName, hasInsights = false, onNavigate }: Props) {
  const connection = useHealthCheck();
  const [taxonomy, setTaxonomy] = useState<InsightTypeInfo[]>([]);
  const [taxonomyState, setTaxonomyState] = useState<TaxonomyState>("loading");

  useEffect(() => {
    const controller = new AbortController();
    setTaxonomyState("loading");
    api
      .taxonomy(controller.signal)
      .then((items) => {
        setTaxonomy(items);
        setTaxonomyState("ready");
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setTaxonomy([]);
        setTaxonomyState("error");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="dashboard-command" aria-labelledby="dashboard-title">
          <div className="dashboard-hero">
            <div className="relative z-10">
              <p className="eyebrow">Evidence-led campaign workspace</p>
              <h1 id="dashboard-title" className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
                Turn customer evidence into a campaign you can defend.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Collect customer signals, isolate the behavioural patterns that
                matter, and carry every recommendation back to its source.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate(selectedClientId ? "insights" : "import")}
                  className="primary-button"
                >
                  {selectedClientId ? "Continue analysis" : "Create your first workspace"}
                  <span aria-hidden>→</span>
                </button>
              </div>
            </div>

            <ol className="workspace-path" aria-label="Campaign workflow path">
              {[
                ["Data", "Data-driven analysis"],
                ["Insight", "Find marketing insights"],
                ["Campaign", "Auto-generate campaigns"],
                ["Planning", "Manage customer activities"],
              ].map(([label, description], index) => (
                <li key={label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <section className="why-intelligence" aria-label="Why campaign intelligence">
            <p className="section-kicker">Why campaign intelligence</p>
            <div className="why-intelligence-grid">
              {[
                ["shield", "Evidence-led", "Every insight is linked to original customer data."],
                ["chart", "Dynamic", "Real-time updates as new signals come in."],
                ["link", "Traceable", "Track every recommendation to its source."],
                ["users", "Actionable", "Turn insights into campaigns, fast."],
              ].map(([icon, title, copy]) => (
                <article key={title} className="why-intelligence-card">
                  <span className="why-intelligence-icon"><WhyIcon name={icon as WhyIconName} /></span>
                  <div>
                    <strong>{title}</strong>
                    <p>{copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="command-status-card" aria-label="Workspace status">
            <div className="command-status-heading">
              <div>
                <p className="section-kicker">Workspace status</p>
                <h2>Ready for the next signal</h2>
              </div>
              <span className="live-orb" aria-hidden="true" />
            </div>

            <div className="status-stack">
              <div className="status-row">
                <span>Backend connection</span>
                <StatusBadge state={connection} />
              </div>
              <div className="status-row">
                <span>Client context</span>
                <span className="status-value">
                  <i className={`status-alert-dot ${selectedClientId ? "status-ok-dot" : ""}`} aria-hidden="true" />
                  <strong>
                    {selectedClientId ? `Client #${selectedClientId}` : "Not selected"}
                  </strong>
                </span>
              </div>
              <div className="status-row">
                <span>Insight framework</span>
                <span className="status-value">
                  <i className={`status-alert-dot ${hasInsights ? "status-ok-dot" : ""}`} aria-hidden="true" />
                  <strong>
                    {taxonomyState === "ready"
                      ? `${taxonomy.length} behaviour categories`
                      : taxonomyState === "loading"
                        ? "Loading"
                        : "Unavailable"}
                  </strong>
                </span>
              </div>
            </div>

            <div
              className="next-step-panel cursor-pointer"
              role="link"
              tabIndex={0}
              onClick={() => onNavigate(selectedClientId ? "insights" : "import")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onNavigate(selectedClientId ? "insights" : "import");
                }
              }}
              aria-label={selectedClientId ? "Choose a ready dataset" : "Select or add an SME client"}
            >
              <span className="next-step-icon" aria-hidden="true">↗</span>
              <div>
                <small>Recommended next step</small>
                <strong>
                  {selectedClientId ? "Choose a ready dataset" : "Select or add an SME client"}
                </strong>
              </div>
            </div>
          </aside>
        </section>

        <section id="workflow-section" className="workflow-shell" aria-labelledby="workflow-title">
          <span className="workflow-status-dot" aria-hidden="true" />
          <div className="section-heading">
            <div>
              <p className="section-kicker">Workflow</p>
              <h2 id="workflow-title" className="mt-1 text-2xl font-semibold text-white">
                One traceable path from signal to action
              </h2>
            </div>
            <div className="workflow-heading-actions">
                <span className="context-pill">
                  {selectedClientId
                    ? `Client #${selectedClientName || selectedClientId} active`
                    : "No client selected"}
              </span>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            {WORKFLOW.map((item) => (
              <article
                key={item.step}
                className="workflow-card group"
                role="link"
                tabIndex={0}
                onClick={() => onNavigate(item.view)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onNavigate(item.view);
                  }
                }}
              >
                <div className="workflow-card-top">
                  <span>Step {item.step}</span>
                  <i aria-hidden="true">↗</i>
                </div>
                <h3>{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">
                  {item.description}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate(item.view)}
                  className="mt-5 self-start text-sm font-semibold text-cyan-300 transition group-hover:text-cyan-200"
                >
                  {item.action} <span aria-hidden>→</span>
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="taxonomy-section border-t border-slate-700/60 pt-8" aria-labelledby="taxonomy-title">
          <div className="section-card-heading justify-center border-b-0 text-center">
            <div>
              <p className="section-kicker">Customer journey</p>
              <h2 id="taxonomy-title">
                From trial to retention
              </h2>
              <button
                type="button"
                className="next-step-icon mx-auto mt-4 transition hover:scale-110"
                onClick={() => onNavigate("trial-retention")}
                aria-label="Open Trial vs retention"
              >
                ↗
              </button>
            </div>
          </div>
          <div className="relative mx-auto mt-6 max-w-4xl">
            <div className="journey-rail" aria-hidden="true">
              {Array.from({ length: 11 }, (_, index) => <i key={index} />)}
            </div>
            <div className="relative grid grid-cols-3 gap-3">
            {[
              ["Trial", "First try", "bg-sky-300"],
              ["Retention", "Keeps choosing", "bg-emerald-300"],
              ["Non-repeat", "Does not return", "bg-orange-300"],
            ].map(([stage, description, color]) => (
              <button
                key={stage}
                type="button"
                className="group rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4 text-center transition hover:border-cyan-300/70 hover:bg-slate-800/70"
                onClick={() => onNavigate("trial-retention")}
              >
                <span className={`journey-dot mx-auto mb-3 block h-10 w-10 rounded-full border-4 ${color} shadow-[0_0_0_8px_rgba(125,211,252,0.08)] transition group-hover:scale-110`} />
                <strong className="block text-sm text-white">{stage}</strong>
                <span className="mt-1 block text-xs text-slate-400">{description}</span>
              </button>
            ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
