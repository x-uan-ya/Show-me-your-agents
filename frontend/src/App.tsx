import { useState } from "react";

import { Dashboard } from "./pages/Dashboard";
import { ImportData } from "./pages/ImportData";

type View = "dashboard" | "import";

export default function App() {
  const [view, setView] = useState<View>("dashboard");

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="flex gap-2 border-b border-slate-800 bg-slate-900 px-6 py-3">
        <button
          type="button"
          onClick={() => setView("dashboard")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            view === "dashboard"
              ? "bg-sky-600 text-white"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setView("import")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            view === "import"
              ? "bg-sky-600 text-white"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          Import Data
        </button>
      </nav>
      {view === "dashboard" ? <Dashboard /> : <ImportData />}
    </div>
  );
}
