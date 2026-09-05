import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { InsightCard } from "../components/InsightCard";
import {
  InsightFilters,
  type InsightFilterState,
} from "../components/InsightFilters";
import { ClientSelector } from "../components/ClientSelector";
import {
  CATEGORY_LABELS,
  INSIGHT_CATEGORIES,
  type CustomerSignal,
  type Dataset,
  type Insight,
  type InsightCategory,
} from "../types";
import { looksSynthetic } from "../utils/format";

type Status = "idle" | "loading" | "ready" | "error";

const EMPTY_FILTERS: InsightFilterState = {
  category: "",
  confidence: "",
  source: "",
  product: "",
};

export function Insights() {
  const [clientId, setClientId] = useState<number | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<number | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [signalsById, setSignalsById] = useState<Map<number, CustomerSignal>>(
    new Map(),
  );
  const [filters, setFilters] = useState<InsightFilterState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Insight | null>(null);

  // Load datasets when a client is chosen.
  useEffect(() => {
    if (clientId === null) return;
    setDatasets([]);
    setDatasetId(null);
    setInsights([]);
    setStatus("idle");
    api
      .listDatasets(clientId)
      .then((ds) => setDatasets(ds))
      .catch((e) => setError((e as Error).message));
  }, [clientId]);

  const runAnalysis = async () => {
    if (clientId === null || datasetId === null) return;
    setStatus("loading");
    setError(null);
    setInsights([]);
    setFilters(EMPTY_FILTERS);
    try {
      // Fetch analysis and full signals in parallel; join evidence to signals.
      const [analysis, signals] = await Promise.all([
        api.analyse(clientId, datasetId),
        api.listSignals(clientId),
      ]);
      const map = new Map<number, CustomerSignal>();
      signals.forEach((s) => map.set(s.id, s));
      setSignalsById(map);
      setInsights(analysis.insights);
      setStatus("ready");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  // Distinct source / product values across evidence, for the filters.
  const { sources, products } = useMemo(() => {
    const src = new Set<string>();
    const prod = new Set<string>();
    insights.forEach((ins) =>
      ins.evidence.forEach((ev) => {
        const signal = signalsById.get(ev.signal_id);
        if (signal?.source) src.add(signal.source);
        if (signal?.product) prod.add(signal.product);
      }),
    );
    return {
      sources: [...src].sort(),
      products: [...prod].sort(),
    };
  }, [insights, signalsById]);

  // Any synthetic evidence present? Then show a visible label.
  const hasSynthetic = useMemo(
    () =>
      [...signalsById.values()].some((s) => looksSynthetic(s)),
    [signalsById],
  );

  // Apply filters. Source/product match if ANY evidence signal matches.
  const filtered = useMemo(() => {
    return insights.filter((ins) => {
      if (filters.category && ins.category !== filters.category) return false;
      if (filters.confidence && ins.confidence_label !== filters.confidence)
        return false;
      if (filters.source || filters.product) {
        const match = ins.evidence.some((ev) => {
          const signal = signalsById.get(ev.signal_id);
          if (!signal) return false;
          if (filters.source && signal.source !== filters.source) return false;
          if (filters.product && signal.product !== filters.product)
            return false;
          return true;
        });
        if (!match) return false;
      }
      return true;
    });
  }, [insights, filters, signalsById]);

  // Group filtered insights by category, preserving the required order.
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
    filtered.forEach((ins) => {
      if (ins.category in groups) groups[ins.category].push(ins);
    });
    return groups;
  }, [filtered]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Customer Insights</h1>

        {hasSynthetic && (
          <div className="rounded border border-fuchsia-800 bg-fuchsia-950/40 px-4 py-2 text-sm font-medium text-fuchsia-200">
            SYNTHETIC DEVELOPMENT DATA - insights below are derived from invented
            sample feedback, not real customer data.
          </div>
        )}

        {/* Controls */}
        <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-5">
          <ClientSelector selectedId={clientId} onSelect={setClientId} />

          {clientId !== null && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-300">
                Dataset
                <select
                  className="mt-1 block w-64 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  value={datasetId ?? ""}
                  onChange={(e) =>
                    setDatasetId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">— select a dataset —</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.record_count} records)
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={datasetId === null || status === "loading"}
                onClick={runAnalysis}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "loading" ? "Analysing..." : "Analyse dataset"}
              </button>
            </div>
          )}
        </section>

        {/* States */}
        {status === "loading" && (
          <p className="text-sm text-slate-400">
            Analysing customer signals and gathering evidence...
          </p>
        )}

        {status === "error" && (
          <div className="rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            Could not complete analysis: {error}
          </div>
        )}

        {status === "ready" && insights.length === 0 && (
          <div className="rounded border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
            No insights were produced for this dataset. Try a dataset with more
            customer feedback, or check the import.
          </div>
        )}

        {/* Results */}
        {status === "ready" && insights.length > 0 && (
          <>
            <InsightFilters
              filters={filters}
              onChange={setFilters}
              sources={sources}
              products={products}
            />

            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400">
                No insights match the current filters.
              </p>
            ) : (
              <div className="space-y-8">
                {INSIGHT_CATEGORIES.map((category) => {
                  const items = grouped[category];
                  if (items.length === 0) return null;
                  return (
                    <section key={category}>
                      <h2 className="mb-3 text-lg font-semibold text-slate-200">
                        {CATEGORY_LABELS[category]}
                        <span className="ml-2 text-sm font-normal text-slate-500">
                          ({items.length})
                        </span>
                      </h2>
                      <div className="grid gap-4 md:grid-cols-2">
                        {items.map((ins) => (
                          <InsightCard
                            key={ins.id}
                            insight={ins}
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
