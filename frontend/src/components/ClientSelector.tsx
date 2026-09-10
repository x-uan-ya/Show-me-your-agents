import { useEffect, useId, useRef, useState } from "react";

import { api, isAbortError } from "../api/client";
import type { Client } from "../types";

interface Props {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  disabled?: boolean;
}

// Loads the client list and lets the user pick one, or create a quick client
// for development (useful with synthetic data for a single client).
export function ClientSelector({ selectedId, onSelect, disabled = false }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [newName, setNewName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const createController = useRef<AbortController | null>(null);
  const id = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .listClients(controller.signal)
      .then((items) => {
        setClients(items);
        if (selectedId !== null && !items.some((client) => client.id === selectedId)) {
          onSelect(null);
        }
      })
      .catch((e) => {
        if (!isAbortError(e)) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // This list is loaded once per mounted workspace view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => createController.current?.abort(), []);

  const createClient = async () => {
    if (!newName.trim() || disabled || creating) return;
    const controller = new AbortController();
    createController.current?.abort();
    createController.current = controller;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createClient(
        {
          name: newName.trim(),
          ...(newIndustry.trim() ? { industry: newIndustry.trim() } : {}),
        },
        controller.signal,
      );
      setNewName("");
      setNewIndustry("");
      setClients((prev) => [...prev, created]);
      onSelect(created.id);
    } catch (e) {
      if (!isAbortError(e)) setError((e as Error).message);
    } finally {
      if (createController.current === controller) {
        createController.current = null;
        setCreating(false);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
        <label className="text-sm font-medium text-slate-200" htmlFor={`${id}-select`}>
          Client
        </label>
        <select
          id={`${id}-select`}
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          value={selectedId ?? ""}
          disabled={disabled || loading}
          onChange={(e) =>
            onSelect(e.target.value === "" ? null : Number(e.target.value))
          }
        >
          <option value="">{loading ? "Loading clients..." : "Select a client"}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.industry ? ` - ${c.industry}` : ""}
            </option>
          ))}
        </select>
      </div>

      <form
        className="quick-add-form grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,0.75fr)_auto] sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          void createClient();
        }}
      >
        <label className="text-sm text-slate-400" htmlFor={`${id}-name`}>
          Quick add
        </label>
        <input
          id={`${id}-name`}
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
          placeholder="Client name"
          value={newName}
          disabled={disabled || creating}
          maxLength={256}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          aria-label="Client industry"
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
          placeholder="Industry (optional)"
          value={newIndustry}
          disabled={disabled || creating}
          maxLength={128}
          onChange={(e) => setNewIndustry(e.target.value)}
        />
        <button
          type="submit"
          disabled={disabled || creating || !newName.trim()}
          className="primary-button"
        >
          {creating ? "Adding..." : "Add client"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
