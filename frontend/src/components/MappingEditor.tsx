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
    <div className="space-y-3">
      {CANONICAL_FIELDS.map((field) => {
        const required = REQUIRED.includes(field);
        return (
          <div key={field} className="flex items-center gap-3">
            <label className="w-32 text-sm text-slate-200" htmlFor={`map-${field}`}>
              {field}
              {required && <span className="text-red-400"> *</span>}
            </label>
            <select
              id={`map-${field}`}
              className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              value={mapping[field] ?? ""}
              onChange={(e) => setField(field, e.target.value)}
            >
              <option value="">— not mapped —</option>
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
