import { useEffect, useMemo, useRef, useState } from "react";

import { api, isAbortError } from "../api/client";
import { ClientSelector } from "../components/ClientSelector";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { InsightCard } from "../components/InsightCard";
import {
  InsightFilters,
  type InsightFilterState,
} from "../components/InsightFilters";
import {
  CATEGORY_LABELS,
  INSIGHT_CATEGORIES,
  type AnalysisRun,
  type AnalyseResponse,
  type AppView,
  type CustomerSignal,
  type Dataset,
  type Insight,
  type InsightCategory,
  type WorkflowStatus,
} from "../types";
import { looksSynthetic } from "../utils/format";

interface Props {
  clientId: number | null;
  datasetId: number | null;
  initialInsights: Insight[];
  initialAnalysisRun?: AnalysisRun | null;
  restoreStatus?: "idle" | "loading" | "ready" | "error";
  restoreError?: string | null;
  workflowStatus?: WorkflowStatus | null;
  onClientChange: (id: number | null) => void;
  onDatasetChange: (id: number | null) => void;
  onNavigate: (view: AppView) => void;
  onRetryRestore?: () => void;
  onAnalysisComplete: (response: AnalyseResponse) => void;
}

type Status = "idle" | "loading" | "ready" | "error";
type DatasetStatus = "idle" | "loading" | "ready" | "error";

const EMPTY_FILTERS: InsightFilterState = {
  category: "",
  confidence: "",
  source: "",
  product: "",
};

const INSIGHT_SUMMARY: Record<InsightCategory, { phrase: string; icon: string }> = {
  PURCHASE_DRIVER: { phrase: "Why customers buy", icon: "↗" },
  TRIAL_DRIVER: { phrase: "Why customers try", icon: "✦" },
  RETENTION_DRIVER: { phrase: "Why customers stay", icon: "↻" },
  NON_REPEAT_DRIVER: { phrase: "Why customers leave", icon: "↘" },
  PAIN_POINT: { phrase: "What frustrates customers", icon: "!" },
  UNMET_NEED: { phrase: "What customers still need", icon: "＋" },
  CUSTOMER_ANXIETY: { phrase: "What customers worry about", icon: "?" },
  EMERGING_DEMAND: { phrase: "What customers may want next", icon: "→" },
};

function isReady(dataset: Dataset): boolean {
  return dataset.status.toLowerCase() === "ready";
}

export function Insights({
  clientId,
  datasetId,
  initialInsights,
  initialAnalysisRun = null,
  restoreStatus = "ready",
  restoreError = null,
  workflowStatus = null,
  onClientChange,
  onDatasetChange,
  onNavigate,
  onRetryRestore,
  onAnalysisComplete,
}: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus>("idle");
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetReloadVersion, setDatasetReloadVersion] = useState(0);

  const [status, setStatus] = useState<Status>(initialInsights.length > 0 ? "ready" : "idle");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceWarning, setEvidenceWarning] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [analysisRun, setAnalysisRun] = useState<AnalysisRun | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [signalsById, setSignalsById] = useState<Map<number, CustomerSignal>>(
    new Map(),
  );
  const [filters, setFilters] = useState<InsightFilterState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Insight | null>(null);

  const datasetController = useRef<AbortController | null>(null);
  const analysisController = useRef<AbortController | null>(null);

  const clearResults = () => {
    setStatus("idle");
    setError(null);
    setEvidenceWarning(null);
    setInsights([]);
    setAnalysisRun(null);
    setRejected([]);
    setSignalsById(new Map());
    setFilters(EMPTY_FILTERS);
    setSelected(null);
  };

  useEffect(() => {
    datasetController.current?.abort();
    analysisController.current?.abort();
    clearResults();
    setIsAnalysing(false);
    setDatasets([]);
    setDatasetError(null);

    if (clientId === null) {
      setDatasetStatus("idle");
      return;
    }

    const controller = new AbortController();
    datasetController.current = controller;
    setDatasetStatus("loading");
    api
      .listDatasets(clientId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setDatasets(items);
        setDatasetStatus("ready");
        if (
          datasetId !== null &&
          !items.some((item) => item.id === datasetId && isReady(item))
        ) {
          onDatasetChange(null);
        } else if (datasetId === null) {
          const newestReady = items
            .filter(isReady)
            .sort((left, right) => right.id - left.id)[0];
          if (newestReady) onDatasetChange(newestReady.id);
        }
      })
      .catch((reason) => {
        if (isAbortError(reason)) return;
        setDatasetError((reason as Error).message);
        setDatasetStatus("error");
      });

    return () => controller.abort();
    // Reload only when the shared client context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, datasetReloadVersion]);

  useEffect(() => {
    if (clientId === null) {
      clearResults();
      return;
    }
    const restored = initialInsights.filter((insight) => insight.client_id === clientId);
    if (restored.length > 0 || initialAnalysisRun?.client_id === clientId) {
      setInsights(restored);
      setAnalysisRun(initialAnalysisRun?.client_id === clientId ? initialAnalysisRun : null);
      setStatus("ready");
      setError(null);
      setRejected([]);
      setFilters(EMPTY_FILTERS);
      setSelected(null);
    } else if (restoreStatus === "ready") {
      clearResults();
    }
  }, [clientId, initialAnalysisRun, initialInsights, restoreStatus]);

  useEffect(() => {
    if (clientId === null || insights.length === 0) return;
    const controller = new AbortController();
    void api.listSignals(clientId, controller.signal)
      .then((signals) => {
        if (controller.signal.aborted) return;
        setSignalsById(new Map(
          signals
            .filter((signal) => signal.client_id === clientId)
            .map((signal) => [signal.id, signal]),
        ));
      })
      .catch((reason) => {
        if (controller.signal.aborted || isAbortError(reason)) return;
        setEvidenceWarning(
          "Insights are available, but source metadata could not be loaded. Evidence excerpts remain visible.",
        );
      });
    return () => controller.abort();
  }, [clientId, insights]);

  useEffect(
    () => () => {
      datasetController.current?.abort();
      analysisController.current?.abort();
    },
    [],
  );

  const changeClient = (nextClientId: number | null) => {
    datasetController.current?.abort();
    analysisController.current?.abort();
    clearResults();
    setIsAnalysing(false);
    setDatasets([]);
    setDatasetError(null);
    onClientChange(nextClientId);
  };

  const changeDataset = (nextDatasetId: number | null) => {
    if (nextDatasetId === datasetId) return;
    analysisController.current?.abort();
    setError(null);
    setIsAnalysing(false);
    onDatasetChange(nextDatasetId);
  };

  const runAnalysis = async () => {
    if (clientId === null || datasetId === null || isAnalysing) return;
    const dataset = datasets.find((item) => item.id === datasetId);
    if (!dataset || !isReady(dataset)) {
      setStatus("error");
      setError("Choose a dataset marked Ready before running analysis.");
      return;
    }

    const controller = new AbortController();
    analysisController.current?.abort();
    analysisController.current = controller;
    setIsAnalysing(true);
    if (insights.length === 0) setStatus("loading");
    setError(null);
    setEvidenceWarning(null);

    try {
      const [analysisOutcome, signalsOutcome] = await Promise.allSettled([
        api.analyse(clientId, datasetId, controller.signal),
        api.listSignals(clientId, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (analysisOutcome.status === "rejected") throw analysisOutcome.reason;

      if (signalsOutcome.status === "fulfilled") {
        const map = new Map<number, CustomerSignal>();
        signalsOutcome.value.forEach((signal) => map.set(signal.id, signal));
        setSignalsById(map);
      } else {
        setEvidenceWarning(
          "Insights are available, but source metadata could not be loaded. Evidence excerpts remain visible.",
        );
      }

      setAnalysisRun(analysisOutcome.value.analysis_run);
      setRejected(analysisOutcome.value.rejected);
      setInsights(analysisOutcome.value.insights);
      onAnalysisComplete(analysisOutcome.value);
      setStatus("ready");
      requestAnimationFrame(() => {
        document.getElementById("analysis-complete")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (reason) {
      if (!isAbortError(reason)) {
        setError((reason as Error).message);
        setStatus(insights.length > 0 ? "ready" : "error");
      }
    } finally {
      setIsAnalysing(false);
      if (analysisController.current === controller) {
        analysisController.current = null;
      }
    }
  };

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === datasetId) ?? null,
    [datasets, datasetId],
  );
  const analysedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === analysisRun?.dataset_id) ?? null,
    [analysisRun?.dataset_id, datasets],
  );

  const { sources, products } = useMemo(() => {
    const sourceValues = new Set<string>();
    const productValues = new Set<string>();
    insights.forEach((insight) =>
      insight.evidence.forEach((evidence) => {
        const signal = signalsById.get(evidence.signal_id);
        if (signal?.source) sourceValues.add(signal.source);
        if (signal?.product) productValues.add(signal.product);
      }),
    );
    return {
      sources: [...sourceValues].sort(),
      products: [...productValues].sort(),
    };
  }, [insights, signalsById]);

  const hasSynthetic = useMemo(
    () =>
      insights.some((insight) =>
        insight.evidence.some((evidence) => {
          const signal = signalsById.get(evidence.signal_id);
          return signal ? looksSynthetic(signal) : false;
        }),
      ),
    [insights, signalsById],
  );

  const filtered = useMemo(
    () =>
      insights.filter((insight) => {
        if (filters.category && insight.category !== filters.category) return false;
        if (
          filters.confidence &&
          insight.confidence_label !== filters.confidence
        ) {
          return false;
        }
        if (filters.source || filters.product) {
          return insight.evidence.some((evidence) => {
            const signal = signalsById.get(evidence.signal_id);
            if (!signal) return false;
            if (filters.source && signal.source !== filters.source) return false;
            if (filters.product && signal.product !== filters.product) return false;
            return true;
          });
        }
        return true;
      }),
    [insights, filters, signalsById],
  );

  const grouped = useMemo(() => {
    const groups: Record<InsightCategory, Insight[]> = {
      PURCHASE_DRIVER: [],
      TRIAL_DRIVER: [],
      RETENTION_DRIVER: [],
      NON_REPEAT_DRIVER: [],
      PAIN_POINT: [],
      UNMET_NEED: [],
      CUSTOMER_ANXIETY: [],
      EMERGING_DEMAND: [],
    };
    filtered.forEach((insight) => groups[insight.category]?.push(insight));
    return groups;
  }, [filtered]);

  const readyDatasetCount = datasets.filter(isReady).length;
  const resultMetrics = useMemo(
    () => ({
      evidence: insights.reduce((total, insight) => total + insight.evidence_count, 0),
      categories: INSIGHT_CATEGORIES.filter((category) => grouped[category].length > 0)
        .length,
      highConfidence: insights.filter(
        (insight) => insight.confidence_label === "High",
      ).length,
    }),
    [grouped, insights],
  );

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Evidence-backed interpretation</p>
            <h1>Customer insights</h1>
            <p>
              Identify what customers value, hesitate over and repeatedly ask
              for - with every claim linked to supporting feedback.
            </p>
          </div>
          {analysisRun && (
            <div className="context-pill">
              Run #{analysisRun.id} · {analysisRun.status}
            </div>
          )}
          <div className="step-rail" aria-label="Customer journey progress">
            <span>1</span><i /><span className="is-active">2</span><i /><span>3</span>
          </div>
        </header>

        {clientId !== null && restoreStatus === "loading" && insights.length === 0 && (
          <div role="status" className="analysis-progress">
            <span className="analysis-pulse" aria-hidden />
            <div>
              <p className="font-medium text-white">Loading this client’s latest insights…</p>
              <p className="text-sm text-slate-400">Restoring the latest completed analysis from the backend.</p>
            </div>
          </div>
        )}

        {clientId !== null && restoreStatus === "error" && (
          <div className="restore-warning" role={insights.length > 0 ? "status" : "alert"}>
            <div>
              <strong>Unable to load the latest saved insights.</strong>
              <span>{restoreError ?? "Your existing data has not been reset."}</span>
            </div>
            {onRetryRestore && <button type="button" className="secondary-button" onClick={onRetryRestore}>Retry</button>}
          </div>
        )}

        <section className="surface-card analysis-control-panel space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Analysis setup</p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Choose the evidence scope
              </h2>
            </div>
            <span className="context-pill">
              {readyDatasetCount} ready dataset{readyDatasetCount === 1 ? "" : "s"}
            </span>
          </div>
          <ClientSelector
            selectedId={clientId}
            onSelect={changeClient}
            disabled={isAnalysing}
          />

          {clientId !== null && (
            <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-medium text-slate-200">
                Dataset
                <select
                  className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
                  value={datasetId ?? ""}
                  disabled={datasetStatus === "loading" || isAnalysing}
                  onChange={(event) =>
                    changeDataset(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">
                    {datasetStatus === "loading"
                      ? "Loading datasets..."
                      : "Select a ready dataset"}
                  </option>
                  {datasets.map((dataset) => (
                    <option
                      key={dataset.id}
                      value={dataset.id}
                      disabled={!isReady(dataset)}
                    >
                      {dataset.name} · {dataset.record_count} records · {dataset.status}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={
                  datasetId === null ||
                  isAnalysing ||
                  !selectedDataset ||
                  !isReady(selectedDataset)
                }
                onClick={() => void runAnalysis()}
                className="primary-button"
              >
                {isAnalysing ? "Analysing..." : "Analyse dataset"}
              </button>
            </div>
          )}

          {datasetStatus === "ready" && clientId !== null && readyDatasetCount === 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/70 bg-amber-950/25 p-4 text-sm text-amber-100">
              <span>No ready datasets are available for this client.</span>
              <button
                type="button"
                onClick={() => onNavigate("import")}
                className="secondary-button"
              >
                Import feedback
              </button>
            </div>
          )}

          {datasetStatus === "error" && datasetError && (
            <div className="restore-warning" role="alert">
              <div>
                <strong>Could not load this client’s datasets.</strong>
                <span>{datasetError}</span>
              </div>
              <button type="button" className="secondary-button" onClick={() => setDatasetReloadVersion((value) => value + 1)}>Retry</button>
            </div>
          )}
        </section>

        {clientId === null && (
          <section className="guided-empty-state">
            <div>
              <p className="section-kicker">Client required</p>
              <h2>Select a client to restore its workflow</h2>
              <p>The page will load that client’s datasets and latest completed analysis automatically.</p>
            </div>
          </section>
        )}

        {clientId !== null && restoreStatus === "ready" && workflowStatus?.data && !workflowStatus.analysis && (
          <section className="guided-empty-state">
            <div>
              <p className="section-kicker">Analysis required</p>
              <h2>Customer feedback is ready</h2>
              <p>
                {workflowStatus.brief ? "Your Marketing Brief is saved. " : ""}
                No completed analysis is available yet. Choose the ready dataset above and run analysis.
              </p>
            </div>
          </section>
        )}

        {isAnalysing && (
          <div role="status" className="analysis-progress">
            <span className="analysis-pulse" aria-hidden />
            <div>
              <p className="font-medium text-white">Reading customer signals</p>
              <p className="text-sm text-slate-400">
                Grouping recurring themes and linking claims to evidence.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200"
          >
            Could not complete analysis: {error}
          </div>
        )}

        {evidenceWarning && (
          <div
            role="status"
            className="rounded-xl border border-amber-800/70 bg-amber-950/30 p-4 text-sm text-amber-100"
          >
            {evidenceWarning}
          </div>
        )}

        {hasSynthetic && (
          <div className="rounded-xl border border-fuchsia-800/70 bg-fuchsia-950/30 px-4 py-3 text-sm font-medium text-fuchsia-100">
            Synthetic development data is present in the evidence for this result.
          </div>
        )}

        {status === "ready" && (
          <section id="analysis-complete" className="surface-card analysis-summary p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="section-kicker">Analysis complete</p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  {insights.length} evidence-backed insight
                  {insights.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {analysedDataset?.name ?? `Dataset #${analysisRun?.dataset_id ?? datasetId}`}
                  {analysisRun?.completed_at
                    ? ` · completed ${new Date(analysisRun.completed_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate("trial-retention")}
                  className="secondary-button"
                >
                  Compare trial and retention
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("campaign-plan")}
                  className="primary-button"
                >
                  Build campaign plan
                </button>
              </div>
            </div>

            <dl className="result-metric-grid">
              <div>
                <dt>Supporting evidence</dt>
                <dd>{resultMetrics.evidence}</dd>
              </div>
              <div>
                <dt>Categories represented</dt>
                <dd>{resultMetrics.categories}</dd>
              </div>
              <div>
                <dt>High-confidence insights</dt>
                <dd>{resultMetrics.highConfidence}</dd>
              </div>
            </dl>

            {rejected.length > 0 && (
              <details className="mt-4 rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-100">
                <summary className="cursor-pointer font-medium">
                  {rejected.length} generated item{rejected.length === 1 ? " was" : "s were"} excluded
                </summary>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-amber-200/80">
                  {rejected.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {status === "idle" && restoreStatus !== "loading" && clientId !== null && (
          <section aria-labelledby="insight-areas-title">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="section-kicker">Insight areas</p>
                <h2 id="insight-areas-title" className="mt-1 text-2xl font-semibold text-white">What we look for</h2>
              </div>
              <span className="text-sm text-slate-400">8 areas</span>
            </div>
            <div className="insight-area-grid">
              {INSIGHT_CATEGORIES.map((category) => (
                <article key={category} className="insight-area-card">
                  <span className="insight-area-icon" aria-hidden="true">
                    {INSIGHT_SUMMARY[category].icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-white">
                      {INSIGHT_SUMMARY[category].phrase}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                      {CATEGORY_LABELS[category]}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {status === "ready" && insights.length === 0 && (
          <div className="surface-card p-8 text-center">
            <h2 className="text-lg font-semibold text-white">No insights yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Try a dataset with more customer feedback or review the import.
            </p>
          </div>
        )}

        {status === "ready" && insights.length > 0 && (
          <details className="surface-card insight-results-panel">
            <summary className="insight-results-heading">
              <div>
                <p className="section-kicker">Customer insights</p>
                <h2>Evidence-backed findings</h2>
              </div>
              <div className="insight-results-meta">
                <span>{filtered.length} of {insights.length} shown</span>
                <span className="collapse-chevron" aria-hidden="true">⌄</span>
              </div>
            </summary>

            <div className="insight-results-body">
            <section className="insight-toolbar">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Filter insights</h2>
                <span className="text-sm text-slate-400">
                  {filtered.length} of {insights.length}
                </span>
              </div>
              <InsightFilters
                filters={filters}
                onChange={setFilters}
                sources={sources}
                products={products}
              />
            </section>

            {filtered.length === 0 ? (
              <p className="surface-card p-6 text-center text-sm text-slate-400">
                No insights match the current filters.
              </p>
            ) : (
              <div className="space-y-8">
                {INSIGHT_CATEGORIES.map((category) => {
                  const items = grouped[category];
                  if (items.length === 0) return null;
                  return (
                    <section key={category}>
                      <div className="mb-3 flex items-baseline gap-3">
                        <h2 className="text-lg font-semibold text-slate-100">
                          {CATEGORY_LABELS[category]}
                        </h2>
                        <span className="text-sm text-slate-500">{items.length}</span>
                      </div>
                      <div className="space-y-3">
                        {items.map((insight) => (
                          <InsightCard
                            key={insight.id}
                            insight={insight}
                            onViewEvidence={setSelected}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            </div>
          </details>
        )}
      </div>

      {selected && (
        <EvidenceDrawer
          insight={selected}
          signalsById={signalsById}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
