interface Props {
  columns: string[];
  rows: Record<string, string>[];
}

// Read-only preview of the first few parsed rows so the user can sanity-check
// the file before confirming the import.
export function SamplePreview({ columns, rows }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No sample rows to preview.</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-800 text-slate-200">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, i) => (
            <tr key={i} className="text-slate-300">
              {columns.map((col) => (
                <td key={col} className="max-w-xs truncate px-3 py-2">
                  {row[col] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
