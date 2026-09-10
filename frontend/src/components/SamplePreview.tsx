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
    <div
      className="overflow-x-auto rounded-xl border border-slate-800"
      role="region"
      aria-label="Uploaded CSV sample rows"
      tabIndex={0}
    >
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">
          Preview of the first rows detected in the uploaded CSV file
        </caption>
        <thead className="bg-slate-950 text-slate-300">
          <tr>
            {columns.map((col) => (
              <th key={col} scope="col" className="px-3 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, i) => (
            <tr key={i} className="text-slate-300">
              {columns.map((col) => (
                <td key={col} className="max-w-xs whitespace-normal break-words px-3 py-2.5">
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
