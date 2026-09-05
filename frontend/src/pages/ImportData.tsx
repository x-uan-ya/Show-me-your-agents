import { useMemo, useState } from "react";

import { api } from "../api/client";
import { ClientSelector } from "../components/ClientSelector";
import { MappingEditor } from "../components/MappingEditor";
import { SamplePreview } from "../components/SamplePreview";
import type { ColumnMapping, ImportResult, UploadResponse } from "../types";

// Orchestrates the adaptive CSV ingestion flow:
// select client -> upload CSV -> preview columns -> review/edit mapping ->
// preview sample data -> confirm import -> show imported/skipped/error counts.
export function ImportData() {
  const [clientId, setClientId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canUpload = clientId !== null && file !== null && !busy;
  const canConfirm = useMemo(
    () => upload !== null && Boolean(mapping.text) && !busy,
    [upload, mapping, busy],
  );

  const doUpload = async () => {
    if (clientId === null || !file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await api.uploadDataset(clientId, file);
      setUpload(res);
      setMapping(res.suggested_mapping);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    if (!upload || clientId === null) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.confirmMapping(clientId, upload.dataset_id, mapping);
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setUpload(null);
    setMapping({});
    setResult(null);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Import customer data</h1>

        {/* Step 1: select client */}
        <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">1. Select client</h2>
          <ClientSelector selectedId={clientId} onSelect={setClientId} />
        </section>

        {/* Step 2: upload CSV */}
        <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">2. Upload CSV</h2>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setUpload(null);
              setResult(null);
            }}
            className="block w-full text-sm text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-white hover:file:bg-sky-500"
          />
          <button
            type="button"
            disabled={!canUpload}
            onClick={doUpload}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && !upload ? "Uploading..." : "Upload & inspect"}
          </button>
        </section>

        {/* Steps 3-6: columns, mapping, sample preview */}
        {upload && (
          <section className="space-y-5 rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div>
              <h2 className="text-lg font-semibold">3. Detected columns</h2>
              <p className="mt-1 text-sm text-slate-400">
                {upload.columns.join(", ")}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">4. Suggested mapping</h2>
              <p className="mb-3 text-sm text-slate-400">
                Adjust as needed. <span className="text-slate-200">text</span> is
                required.
              </p>
              <MappingEditor
                columns={upload.columns}
                mapping={mapping}
                onChange={setMapping}
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold">5. Sample data</h2>
              <div className="mt-3">
                <SamplePreview columns={upload.columns} rows={upload.sample_rows} />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold">6. Confirm import</h2>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={doConfirm}
                className="mt-2 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy && upload ? "Importing..." : "Confirm & import"}
              </button>
              {!mapping.text && (
                <p className="mt-2 text-sm text-amber-400">
                  Map a column to <span className="font-medium">text</span> before
                  importing.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Result */}
        {result && (
          <section className="space-y-3 rounded-lg border border-emerald-800 bg-emerald-950/40 p-5">
            <h2 className="text-lg font-semibold text-emerald-300">Import complete</h2>
            <div className="flex gap-6 text-sm">
              <span>
                Imported:{" "}
                <span className="font-semibold text-emerald-300">
                  {result.imported}
                </span>
              </span>
              <span>
                Skipped:{" "}
                <span className="font-semibold text-amber-300">
                  {result.skipped}
                </span>
              </span>
              <span>
                Rows with issues:{" "}
                <span className="font-semibold text-red-300">
                  {result.errors.length}
                </span>
              </span>
            </div>
            {result.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-slate-300">
                {result.errors.map((err, i) => (
                  <li key={i}>
                    Row {err.row ?? "?"}: {(err.issues ?? []).join("; ")}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Import another file
            </button>
          </section>
        )}

        {error && (
          <p className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
