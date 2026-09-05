import { useState } from "react";

import { Dashboard } from "./pages/Dashboard";
import { ImportData } from "./pages/ImportData";
import { Insights } from "./pages/Insights";
import { TrialVsRetention } from "./pages/TrialVsRetention";

type View = "dashboard" | "import" | "insights" | "trial-retention";

const TABS: { id: View; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "import", label: "Import Data" },
  { id: "insights", label: "Customer Insights" },
  { id: "trial-retention", label: "Trial vs Retention" },
];

export default function App() {
  const [view, setView] = useState<View>("dashboard");

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="flex gap-2 border-b border-slate-800 bg-slate-900 px-6 py-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              view === tab.id
                ? "bg-sky-600 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {view === "dashboard" && <Dashboard />}
      {view === "import" && <ImportData />}
      {view === "insights" && <Insights />}
      {view === "trial-retention" && <TrialVsRetention />}
    </div>
  );
}
