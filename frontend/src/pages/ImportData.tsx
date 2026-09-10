import { useEffect, useMemo, useRef, useState } from "react";

import { api, isAbortError } from "../api/client";
import { ClientSelector } from "../components/ClientSelector";
import { MappingEditor } from "../components/MappingEditor";
import { SamplePreview } from "../components/SamplePreview";
import type {
  ColumnMapping,
  ImportResult,
  MarketingBrief,
  UploadResponse,
} from "../types";

interface Props {
  clientId: number | null;
  brief: MarketingBrief;
  onClientChange: (id: number | null) => void;
  onBriefChange: (brief: MarketingBrief) => void;
  onReadyToAnalyse: (datasetId: number) => void;
}

const CHANNELS = ["Instagram", "Facebook", "LinkedIn", "TikTok", "Email"];

type BusyState = "uploading" | "importing" | null;

export function ImportData({
  clientId,
  brief,
  onClientChange,
  onBriefChange,
  onReadyToAnalyse,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const requestController = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  const clearImport = () => {
    setFile(null);
    setUpload(null);
    setMapping({});
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const changeClient = (nextClientId: number | null) => {
    requestController.current?.abort();
    requestController.current = null;
    setBusy(null);
    clearImport();
    onClientChange(nextClientId);
  };

  const canUpload = clientId !== null && file !== null && busy === null;
  const canConfirm = useMemo(
    () =>
      upload !== null &&
      Boolean(mapping.text) &&
      busy === null &&
      result === null,
    [upload, mapping, busy, result],
  );

  const doUpload = async () => {
    if (clientId === null || !file || busy !== null) return;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    setError(null);
    setUpload(null);
    setMapping({});
    setResult(null);
    setBusy("uploading");
    try {
      const response = await api.uploadDataset(
        clientId,
        file,
        undefined,
        controller.signal,
      );
      setUpload(response);
      setMapping(response.suggested_mapping);
    } catch (e) {
      if (!isAbortError(e)) setError((e as Error).message);
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setBusy(null);
      }
    }
  };

  const doConfirm = async () => {
    if (!upload || clientId === null || busy !== null || result !== null) return;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    setError(null);
    setBusy("importing");
    try {
      const response = await api.confirmMapping(
        clientId,
        upload.dataset_id,
        mapping,
        controller.signal,
      );
      setResult(response);
    } catch (e) {
      if (!isAbortError(e)) setError((e as Error).message);
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setBusy(null);
      }
    }
  };

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Signal intake</p>
            <h1>Import customer feedback</h1>
            <p>
              Bring reviews, survey responses or campaign feedback into one
              evidence-ready dataset.
            </p>
          </div>
          <div className="step-rail" aria-label="Import progress">
            <span className="is-active">1</span>
            <i />
            <span className={upload ? "is-active" : ""}>2</span>
            <i />
            <span className={result ? "is-active" : ""}>3</span>
          </div>
        </header>

        <section className="surface-card p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Step 1</p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Choose the client context
              </h2>
            </div>
            <span className="context-pill">
              {clientId === null ? "Required" : `Client #${clientId}`}
            </span>
          </div>
          <ClientSelector
            selectedId={clientId}
            onSelect={changeClient}
            disabled={busy !== null}
          />

          {clientId !== null && (
            <div className="mt-6 border-t border-slate-800 pt-5">
              <div className="mb-4">
                <p className="section-kicker">Campaign brief</p>
                <h3 className="mt-1 text-base font-semibold text-white">
                  Define what this SME wants to achieve
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Saved in this browser for the selected client. It is used by
                  the frontend campaign prototype and is not sent to the backend.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="form-field">
                  Business objective <span aria-hidden>*</span>
                  <input
                    id="business-objective"
                    required
                    aria-required="true"
                    value={brief.objective}
                    placeholder="e.g. Increase qualified trial sign-ups"
                    onChange={(event) =>
                      onBriefChange({ ...brief, objective: event.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  Target audience <span aria-hidden>*</span>
                  <input
                    id="target-audience"
                    required
                    aria-required="true"
                    value={brief.target_audience}
                    placeholder="e.g. Singapore SME owners"
                    onChange={(event) =>
                      onBriefChange({
                        ...brief,
                        target_audience: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field md:col-span-2">
                  Current message
                  <textarea
                    rows={3}
                    value={brief.current_message}
                    placeholder="What is the client saying today?"
                    onChange={(event) =>
                      onBriefChange({
                        ...brief,
                        current_message: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <fieldset className="mt-4" aria-describedby="channels-help">
                <legend className="text-sm font-medium text-slate-200">
                  Active channels <span className="text-cyan-300">*</span>
                </legend>
                <p id="channels-help" className="mt-1 text-sm text-slate-400">
                  Choose at least one channel for the campaign handoff.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CHANNELS.map((channel) => {
                    const selected = brief.channels.includes(channel);
                    return (
                      <label
                        key={channel}
                        className={`channel-option ${selected ? "is-selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            onBriefChange({
                              ...brief,
                              channels: selected
                                ? brief.channels.filter((item) => item !== channel)
                                : [...brief.channels, channel],
                            })
                          }
                        />
                        {channel}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}
        </section>

        <section className="surface-card p-5 sm:p-6">
          <div className="mb-4">
            <p className="section-kicker">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Upload a CSV file
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              You will review detected columns and sample rows before anything is
              confirmed.
            </p>
          </div>
          <div className="upload-control">
            <div className="min-w-0 flex-1">
              <label htmlFor="feedback-csv" className="block text-sm font-semibold text-white">
                Choose customer-feedback CSV
              </label>
              <p id="feedback-csv-help" className="mt-1 text-sm text-slate-400">
                CSV only. You can inspect the columns and sample rows before import.
              </p>
              <input
                id="feedback-csv"
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                aria-describedby="feedback-csv-help"
                disabled={busy !== null || clientId === null}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setUpload(null);
                  setMapping({});
                  setResult(null);
                  setError(null);
                }}
                className="mt-3 block min-w-0 w-full text-sm text-slate-300 file:mr-4 file:min-h-11 file:rounded-xl file:border file:border-slate-600 file:bg-slate-800 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-cyan-100 hover:file:bg-slate-700 disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              disabled={!canUpload}
              onClick={() => void doUpload()}
              className="primary-button"
            >
              {busy === "uploading" ? "Inspecting..." : "Upload and inspect"}
            </button>
          </div>
          {clientId === null && (
            <p className="mt-3 text-sm text-amber-300">
              Select a client before uploading feedback.
            </p>
          )}
        </section>

        {upload && (
          <section className="surface-card space-y-6 p-5 sm:p-6">
            <div>
              <p className="section-kicker">Step 3</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">
                  Review the dataset
                </h2>
                <span className="context-pill">Dataset #{upload.dataset_id}</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Detected columns
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {upload.columns.map((column) => (
                  <span key={column} className="data-chip">
                    {column}
                  </span>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-5">
              <h3 className="text-sm font-semibold text-slate-200">
                Field mapping
              </h3>
              <p className="mb-4 mt-1 text-sm text-slate-400">
                Match your columns to the shared customer-signal fields. Feedback
                text is required.
              </p>
              <MappingEditor
                columns={upload.columns}
                mapping={mapping}
                onChange={(next) => {
                  setMapping(next);
                  setResult(null);
                }}
              />
            </div>

            <div className="border-t border-slate-800 pt-5">
              <h3 className="text-sm font-semibold text-slate-200">
                Sample rows
              </h3>
              <div className="mt-3">
                <SamplePreview columns={upload.columns} rows={upload.sample_rows} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Confirm import
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Confirm only after the preview and mapping look correct.
                </p>
              </div>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => void doConfirm()}
                className="success-button"
              >
                {busy === "importing" ? "Importing..." : "Confirm import"}
              </button>
            </div>
            {!mapping.text && (
              <p className="text-sm text-amber-300">
                Map one source column to the required feedback text field.
              </p>
            )}
          </section>
        )}

        {result && upload && (
          <section
            role="status"
            className="rounded-2xl border border-emerald-700/60 bg-emerald-950/35 p-5 sm:p-6"
          >
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="section-kicker text-emerald-300">Import complete</p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  The dataset is ready for insight analysis
                </h2>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
                  <span>{result.imported} imported</span>
                  <span>{result.skipped} skipped</span>
                  <span>{result.errors.length} rows with issues</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={clearImport}
                  className="secondary-button"
                >
                  Import another
                </button>
                <button
                  type="button"
                  onClick={() => onReadyToAnalyse(upload.dataset_id)}
                  className="primary-button"
                >
                  Analyse this dataset
                </button>
              </div>
            </div>

            {result.errors.length > 0 && (
              <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-emerald-900 bg-slate-950/50 p-3 text-sm text-slate-300">
                {result.errors.map((item, index) => (
                  <li key={`${item.row ?? "unknown"}-${index}`}>
                    Row {item.row ?? "?"}: {(item.issues ?? []).join("; ")}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200"
          >
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
