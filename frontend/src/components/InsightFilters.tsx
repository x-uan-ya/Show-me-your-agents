import {
  CATEGORY_LABELS,
  INSIGHT_CATEGORIES,
  type ConfidenceLabel,
  type InsightCategory,
} from "../types";

export interface InsightFilterState {
  category: InsightCategory | "";
  confidence: ConfidenceLabel | "";
  source: string;
  product: string;
}

interface Props {
  filters: InsightFilterState;
  onChange: (filters: InsightFilterState) => void;
  // Distinct source/product values available in the current evidence set.
  sources: string[];
  products: string[];
}

// Filter controls for the insights list: category, confidence, source, product.
export function InsightFilters({ filters, onChange, sources, products }: Props) {
  const set = (partial: Partial<InsightFilterState>) =>
    onChange({ ...filters, ...partial });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="filter-control">
        Category
        <select
          className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
          value={filters.category}
          onChange={(e) =>
            set({ category: e.target.value as InsightCategory | "" })
          }
        >
          <option value="">All categories</option>
          {INSIGHT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-control">
        Confidence
        <select
          className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
          value={filters.confidence}
          onChange={(e) =>
            set({ confidence: e.target.value as ConfidenceLabel | "" })
          }
        >
          <option value="">All confidence</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </label>

      <label className="filter-control">
        Source
        <select
          className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
          value={filters.source}
          onChange={(e) => set({ source: e.target.value })}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-control">
        Product
        <select
          className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"
          value={filters.product}
          onChange={(e) => set({ product: e.target.value })}
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
