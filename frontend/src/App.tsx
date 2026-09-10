import { useEffect, useRef, useState } from "react";

import { Dashboard } from "./pages/Dashboard";
import { CampaignPlan } from "./pages/CampaignPlan";
import { ImportData } from "./pages/ImportData";
import { Insights } from "./pages/Insights";
import { TrialVsRetention } from "./pages/TrialVsRetention";
import {
  EMPTY_MARKETING_BRIEF,
  type AppView,
  type Insight,
  type MarketingBrief,
} from "./types";
import { hashForView, viewFromHash } from "./utils/navigation";

const CLIENT_STORAGE_KEY = "customer-intelligence:selected-client";
const BRIEF_STORAGE_PREFIX = "customer-intelligence:brief:";

const TABS: { id: AppView; label: string; shortLabel: string }[] = [
  { id: "dashboard", label: "Overview", shortLabel: "Overview" },
  { id: "import", label: "Import signals", shortLabel: "Import" },
  { id: "insights", label: "Customer insights", shortLabel: "Insights" },
  { id: "campaign-plan", label: "Campaign plan", shortLabel: "Campaign" },
  {
    id: "trial-retention",
    label: "Trial vs retention",
    shortLabel: "Trial vs retention",
  },
];

const NAV_ICON_PATHS: Record<AppView, string> = {
  dashboard: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M9 19.5v-5h6v5",
  import: "M12 3v12m0 0 4-4m-4 4-4-4M4 18.5V21h16v-2.5",
  insights: "M5 20v-6m7 6V8m7 12V4M3 20h18",
  "campaign-plan": "m4 12 16-8-6 16-3-6-7-2Zm7 2 9-10",
  "trial-retention": "M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3",
};

function NavIcon({ view }: { view: AppView }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={NAV_ICON_PATHS[view]} />
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function storedClientId(): number | null {
  const value = window.localStorage.getItem(CLIENT_STORAGE_KEY);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function storedBrief(clientId: number | null): MarketingBrief {
  if (clientId === null) return EMPTY_MARKETING_BRIEF;
  try {
    const raw = window.localStorage.getItem(`${BRIEF_STORAGE_PREFIX}${clientId}`);
    if (!raw) return EMPTY_MARKETING_BRIEF;
    const parsed = JSON.parse(raw) as Partial<MarketingBrief>;
    return {
      objective: typeof parsed.objective === "string" ? parsed.objective : "",
      target_audience:
        typeof parsed.target_audience === "string" ? parsed.target_audience : "",
      channels: Array.isArray(parsed.channels)
        ? parsed.channels.filter((item): item is string => typeof item === "string")
        : [],
      current_message:
        typeof parsed.current_message === "string" ? parsed.current_message : "",
    };
  } catch {
    return EMPTY_MARKETING_BRIEF;
  }
}

export default function App() {
  const [view, setView] = useState<AppView>(() =>
    viewFromHash(window.location.hash),
  );
  const [clientId, setClientId] = useState<number | null>(storedClientId);
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [brief, setBrief] = useState<MarketingBrief>(() =>
    storedBrief(storedClientId()),
  );
  const [latestInsights, setLatestInsights] = useState<Insight[]>([]);
  const hasMounted = useRef(false);

  useEffect(() => {
    const syncView = () => setView(viewFromHash(window.location.hash));
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  useEffect(() => {
    const label = TABS.find((tab) => tab.id === view)?.label ?? "Overview";
    document.title = `${label} · Customer Intelligence`;
    if (hasMounted.current) {
      window.requestAnimationFrame(() => {
        document.getElementById("workspace-content")?.focus();
      });
    } else {
      hasMounted.current = true;
    }
  }, [view]);

  const navigate = (next: AppView) => {
    const nextHash = hashForView(next);
    if (window.location.hash === nextHash) setView(next);
    else window.location.hash = nextHash;
  };

  const selectClient = (nextClientId: number | null) => {
    setClientId((current) => {
      if (current !== nextClientId) {
        setDatasetId(null);
        setLatestInsights([]);
        setBrief(storedBrief(nextClientId));
      }
      return nextClientId;
    });
    if (nextClientId === null) {
      window.localStorage.removeItem(CLIENT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CLIENT_STORAGE_KEY, String(nextClientId));
    }
  };

  const updateBrief = (nextBrief: MarketingBrief) => {
    setBrief(nextBrief);
    if (clientId !== null) {
      window.localStorage.setItem(
        `${BRIEF_STORAGE_PREFIX}${clientId}`,
        JSON.stringify(nextBrief),
      );
    }
  };

  const openImportedDataset = (nextDatasetId: number) => {
    setDatasetId(nextDatasetId);
    setLatestInsights([]);
    navigate("insights");
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>

      <aside className="app-sidebar">
        <a
          href={hashForView("dashboard")}
          className="app-brand"
          onClick={() => setView("dashboard")}
        >
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              Customer Intelligence
            </span>
            <span className="block truncate text-xs text-slate-500">
              Evidence-led planning
            </span>
          </span>
        </a>

        <div className="sidebar-context">
          <span className="sidebar-context-label">Active workspace</span>
          <span className="sidebar-context-value">
            {clientId === null ? "Choose an SME client" : `Client #${clientId}`}
          </span>
          <span className={`sidebar-status ${clientId === null ? "is-idle" : "is-active"}`}>
            <i aria-hidden="true" />
            {clientId === null ? "Context required" : "Context active"}
          </span>
        </div>

        <nav aria-label="Primary navigation" className="app-nav">
          <p className="app-nav-label">Workspace</p>
          {TABS.map((tab, index) => (
            <a
              key={tab.id}
              href={hashForView(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={`app-nav-link ${view === tab.id ? "is-active" : ""}`}
            >
              <NavIcon view={tab.id} />
              <span>{tab.label}</span>
              <small>{String(index + 1).padStart(2, "0")}</small>
            </a>
          ))}
        </nav>

        <div className="sidebar-loop">
          <span className="sidebar-loop-mark" aria-hidden="true">↗</span>
          <p>Keep every recommendation connected to customer evidence.</p>
          <span>Evidence → action</span>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="mobile-app-header">
          <a
            href={hashForView("dashboard")}
            className="app-brand"
            onClick={() => setView("dashboard")}
          >
            <BrandMark />
            <span className="truncate text-sm font-semibold text-white">
              Customer Intelligence
            </span>
          </a>
          <span className={`mobile-client ${clientId === null ? "is-idle" : "is-active"}`}>
            {clientId === null ? "No client" : `Client #${clientId}`}
          </span>
        </header>

        <nav aria-label="Mobile navigation" className="mobile-tabs">
          {TABS.map((tab) => (
            <a
              key={tab.id}
              href={hashForView(tab.id)}
              aria-current={view === tab.id ? "page" : undefined}
              className={view === tab.id ? "is-active" : ""}
            >
              <NavIcon view={tab.id} />
              <span>{tab.shortLabel}</span>
            </a>
          ))}
        </nav>

        <div id="workspace-content" tabIndex={-1}>
          {view === "dashboard" && (
            <Dashboard selectedClientId={clientId} onNavigate={navigate} />
          )}
          {view === "import" && (
            <ImportData
              clientId={clientId}
              brief={brief}
              onClientChange={selectClient}
              onBriefChange={updateBrief}
              onReadyToAnalyse={openImportedDataset}
            />
          )}
          {view === "insights" && (
            <Insights
              clientId={clientId}
              datasetId={datasetId}
              onClientChange={selectClient}
              onDatasetChange={setDatasetId}
              onNavigate={navigate}
              onAnalysisComplete={setLatestInsights}
            />
          )}
          {view === "campaign-plan" && (
            <CampaignPlan
              clientId={clientId}
              brief={brief}
              insights={latestInsights}
              onNavigate={navigate}
            />
          )}
          {view === "trial-retention" && (
            <TrialVsRetention
              clientId={clientId}
              onClientChange={selectClient}
            />
          )}
        </div>
      </div>
    </div>
  );
}
