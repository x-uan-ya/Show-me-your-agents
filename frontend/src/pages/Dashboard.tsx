import { useEffect, useState } from "react";

import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { useHealthCheck } from "../hooks/useHealthCheck";
import type { InsightTypeInfo } from "../types";

// Landing dashboard. For the pre-SME foundation it confirms backend
// connectivity and previews the behavioural insight taxonomy the system
// reasons about. No dataset or campaign planning is present.
export function Dashboard() {
  const connection = useHealthCheck();
  const [taxonomy, setTaxonomy] = useState<InsightTypeInfo[]>([]);

  useEffect(() => {
    api
      .taxonomy()
      .then(setTaxonomy)
      .catch(() => setTaxonomy([]));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex flex-col items-start gap-4">
          <h1 className="text-3xl font-bold tracking-tight">
            Customer Insight Intelligence
          </h1>
          <StatusBadge state={connection} />
        </header>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-200">
            Behavioural insight taxonomy
          </h2>
          {taxonomy.length === 0 ? (
            <p className="text-sm text-slate-400">
              Taxonomy will appear once the backend is connected.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {taxonomy.map((item) => (
                <article
                  key={item.type}
                  className="rounded-lg border border-slate-800 bg-slate-900 p-4"
                >
                  <h3 className="font-semibold text-slate-100">{item.label}</h3>
                  <p className="mt-1 text-sm text-sky-300">{item.question}</p>
                  <p className="mt-2 text-sm text-slate-400">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
