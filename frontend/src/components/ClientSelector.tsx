import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { Client } from "../types";

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

// Loads the client list and lets the user pick one, or create a quick client
// for development (useful with synthetic data for a single client).
export function ClientSelector({ selectedId, onSelect }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .listClients()
      .then(setClients)
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const createClient = async () => {
    if (!newName.trim()) return;
    try {
      const created = await api.createClient({ name: newName.trim() });
      setNewName("");
      setClients((prev) => [...prev, created]);
      onSelect(created.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="w-32 text-sm text-slate-200" htmlFor="client-select">
          Client
        </label>
        <select
          id="client-select"
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          value={selectedId ?? ""}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          <option value="">— select a client —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="w-32 text-sm text-slate-400" htmlFor="new-client">
          New client
        </label>
        <input
          id="new-client"
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          placeholder="Name a new client"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="button"
          onClick={createClient}
          className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Create
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
