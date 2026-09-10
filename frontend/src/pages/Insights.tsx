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
  type AppView,
  type CustomerSignal,
  type Dataset,
  type Insight,
  type InsightCategory,
} from "../types";
import { looksSynthetic } from "../utils/format";

interface Props {
  clientId: number | null;
  datasetId: number | null;
  onClientChange: (id: number | null) => void;
  onDatasetChange: (id: number | null) => void;
  onNavigate: (view: AppView) => void;
  onAnalysisComplete: (insights: Insight[]) => void;
}

type Status = "idle" | "loading" | "ready" | "error";
type DatasetStatus = "idle" | "loading" | "ready" | "error";

const EMPTY_FILTERS: InsightFilterState = {
  category: "",
  confidence: "",
  source: "",
  product: "",
};

function isReady(dataset: Dataset): boolean {
  return dataset.status.toLowerCase() === "ready";
}

export function Insights({
  clientId,
  datasetId,
  onClientChange,
  onDatasetChange,
  onNavigate,
  onAnalysisComplete,
}: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus>("idle");
  const [datasetError, setDatasetError] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [evidenceWarning, setEvidenceWarning] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
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
  }, [clientId]);

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
    setDatasets([]);
    setDatasetError(null);
    onClientChange(nextClientId);
  };

  const changeDataset = (nextDatasetId: number | null) => {
    if (nextDatasetId === datasetId) return;
    analysisController.current?.abort();
    clearResults();
    onDatasetChange(nextDatasetId);
  };

  const runAnalysis = async () => {
    if (clientId === null || datasetId === null || status === "loading") return;
    const dataset = datasets.find((item) => item.id === datasetId);
    if (!dataset || !isReady(dataset)) {
      setStatus("error");
      setError("Choose a dataset marked Ready before running analysis.");
      return;
    }

    const controller = new AbortController();
    analysisController.current?.abort();
    analysisController.current = controller;
    setStatus("loading");
    setError(null);
    setEvidenceWarning(null);
    setInsights([]);
    setSignalsById(new Map());
    setAnalysisRun(null);
    setRejected([]);
    setFilters(EMPTY_FILTERS);
    setSelected(null);

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
      onAnalysisComplete(analysisOutcome.value.insights);
      setStatus("ready");
    } catch (reason) {
      if (!isAbortError(reason)) {
        setError((reason as Error).message);
        setStatus("error");
      }
    } finally {
      if (analysisController.current === controller) {
        analysisController.current = null;
      }
    }
  };

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === datasetId) ?? null,
    [datasets, datasetId],
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
        </header>

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
            disabled={status === "loading"}
          />

          {clientId !== null && (
            <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-medium text-slate-200">
                Dataset
                <select
                  className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
                  value={datasetId ?? ""}
                  disabled={datasetStatus === "loading" || status === "loading"}
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
                  status === "loading" ||
                  !selectedDataset ||
                  !isReady(selectedDataset)
                }
                onClick={() => void runAnalysis()}
                className="primary-button"
              >
                {status === "loading" ? "Analysing..." : "Analyse dataset"}
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
            <p
              role="alert"
              className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200"
            >
              Could not load datasets: {datasetError}
            </p>
          )}
        </section>

        {status === "loading" && (
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

        {status === "error" && error && (
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
          <section className="surface-card analysis-summary p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="section-kicker">Analysis complete</p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  {insights.length} evidence-backed insight
                  {insights.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedDataset?.name ?? `Dataset #${datasetId}`}
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

        {status === "ready" && insights.length === 0 && (
          <div className="surface-card p-8 text-center">
            <h2 className="text-lg font-semibold text-white">No insights yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Try a dataset with more customer feedback or review the import.
            </p>
          </div>
        )}

        {status === "ready" && insights.length > 0 && (
          <>
            <section className="surface-card insight-toolbar p-5 sm:p-6">
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
          </>
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
