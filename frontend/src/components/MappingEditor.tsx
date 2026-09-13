import { CANONICAL_FIELDS, type CanonicalField, type ColumnMapping } from "../types";

interface Props {
  columns: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

const REQUIRED: CanonicalField[] = ["text"];

// Lets the user review and change the mapping of each canonical field to a
// source column. "text" is required; every other field may be left unmapped.
export function MappingEditor({ columns, mapping, onChange }: Props) {
  const setField = (field: CanonicalField, column: string) => {
    const next = { ...mapping };
    if (column === "") {
      delete next[field];
    } else {
      next[field] = column;
    }
    onChange(next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CANONICAL_FIELDS.map((field) => {
        const required = REQUIRED.includes(field);
        return (
          <div key={field} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400" htmlFor={`map-${field}`}>
              {field.replace(/_/g, " ")}
              {required && <span className="text-red-400"> *</span>}
            </label>
            <select
              id={`map-${field}`}
              required={required}
              aria-required={required}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              value={mapping[field] ?? ""}
              onChange={(e) => setField(field, e.target.value)}
            >
              <option value="">Not mapped</option>
              {columns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
