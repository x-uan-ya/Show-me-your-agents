import { useEffect, useState } from "react";

import { api, isAbortError } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { useHealthCheck } from "../hooks/useHealthCheck";
import type { AppView, InsightTypeInfo } from "../types";

interface Props {
  selectedClientId: number | null;
  onNavigate: (view: AppView) => void;
}

type TaxonomyState = "loading" | "ready" | "error";

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
];

export function Dashboard({ selectedClientId, onNavigate }: Props) {
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
                <button
                  type="button"
                  onClick={() => onNavigate("import")}
                  className="secondary-button"
                >
                  Import customer signals
                </button>
              </div>
            </div>

            <ol className="workspace-path" aria-label="Evidence-led planning path">
              {["Evidence", "Insight", "Strategy", "Campaign"].map((label, index) => (
                <li key={label}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {[
                        "Collect signals",
                        "Find patterns",
                        "Choose direction",
                        "Review the plan",
                      ][index]}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </div>

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
                <strong>
                  {selectedClientId ? `Client #${selectedClientId}` : "Not selected"}
                </strong>
              </div>
              <div className="status-row">
                <span>Insight framework</span>
                <strong>
                  {taxonomyState === "ready"
                    ? `${taxonomy.length} behaviour categories`
                    : taxonomyState === "loading"
                      ? "Loading"
                      : "Unavailable"}
                </strong>
              </div>
            </div>

            <div className="next-step-panel">
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

        <section aria-labelledby="workflow-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">P0 workflow</p>
              <h2 id="workflow-title" className="mt-1 text-2xl font-semibold text-white">
                One traceable path from signal to action
              </h2>
            </div>
            <span className="context-pill">
              {selectedClientId ? `Client #${selectedClientId} active` : "No client selected"}
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {WORKFLOW.map((item) => (
              <article key={item.step} className="workflow-card group">
                <div className="workflow-card-top">
                  <span>{item.step}</span>
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

        <section className="surface-card overflow-hidden" aria-labelledby="taxonomy-title">
          <div className="section-card-heading">
            <div>
              <p className="section-kicker">Interpretation framework</p>
              <h2 id="taxonomy-title">
                Eight questions behind customer behaviour
              </h2>
            </div>
            <span className="context-pill">Behaviour, not sentiment</span>
          </div>
          {taxonomyState === "loading" && (
            <p role="status" className="p-6 text-sm text-slate-400">Loading insight taxonomy…</p>
          )}
          {taxonomyState === "error" && (
            <p role="alert" className="p-6 text-sm text-amber-200">
              The taxonomy is unavailable while the backend is disconnected.
            </p>
          )}
          {taxonomyState === "ready" && (
            <div className="taxonomy-grid">
              {taxonomy.map((item, index) => (
                <article
                  key={item.type}
                  className="taxonomy-card"
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="font-semibold text-white">{item.label}</h3>
                  <p className="mt-1 text-sm font-medium text-cyan-300">{item.question}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
