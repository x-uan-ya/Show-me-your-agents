import { useEffect, useRef, useState } from "react";

import { Dashboard } from "./pages/Dashboard";
import { CampaignPlan } from "./pages/CampaignPlan";
import { CampaignCalendar } from "./pages/CampaignCalendar";
import { ImportData } from "./pages/ImportData";
import { Insights } from "./pages/Insights";
import { SourcesMethodology } from "./pages/SourcesMethodology";
import { TrialVsRetention } from "./pages/TrialVsRetention";
import {
  EMPTY_MARKETING_BRIEF,
  type AppView,
  type Insight,
  type MarketingBrief,
} from "./types";
import { hashForView, viewFromHash } from "./utils/navigation";

const CLIENT_STORAGE_KEY = "customer-intelligence:selected-client";
const CLIENT_NAME_STORAGE_KEY = "customer-intelligence:selected-client-name";
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
  { id: "campaign-calendar", label: "Campaign calendar", shortLabel: "Calendar" },
  { id: "sources", label: "Sources & methodology", shortLabel: "Sources" },
];

const NAV_ICON_PATHS: Record<AppView, string> = {
  dashboard: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M9 19.5v-5h6v5",
  import: "M12 3v12m0 0 4-4m-4 4-4-4M4 18.5V21h16v-2.5",
  insights: "M5 20v-6m7 6V8m7 12V4M3 20h18",
  "campaign-plan": "m4 12 16-8-6 16-3-6-7-2Zm7 2 9-10",
  "trial-retention": "M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3",
  "campaign-calendar": "M5 4h14v16H5zM8 2v4m8-4v4M5 9h14M8 13h3m2 0h3M8 17h3",
  sources: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6M9 9h2",
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
    <span className="brand-mark-wrap" aria-hidden="true">
      <img className="brand-logo-symbol" src="/campaign-intelligence-logo.png" alt="" />
    </span>
  );
}

function WorkspaceCalendar() {
  const today = new Date();
  const month = today.toLocaleString("en-US", { month: "long" });
  const year = today.getFullYear();
  const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
  const firstDay = new Date(year, today.getMonth(), 1).getDay();
  const days = Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1,
  );

  return (
    <div className="workspace-calendar" aria-label={`${month} ${year} calendar`}>
      <div className="workspace-calendar-heading">
        <span>{month} {year}</span>
        <span aria-hidden="true">▾</span>
      </div>
      <div className="workspace-calendar-weekdays">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="workspace-calendar-days">
        {days.map((day, index) => (
          <span key={index} className={day === today.getDate() ? "is-today" : ""}>
            {day ?? ""}
          </span>
        ))}
      </div>
    </div>
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
  const clientName = clientId === null ? "" : window.localStorage.getItem(CLIENT_NAME_STORAGE_KEY) ?? "";
  const [latestInsights, setLatestInsights] = useState<Insight[]>([]);
  const hasMounted = useRef(false);

  useEffect(() => {
    const syncView = () => setView(viewFromHash(window.location.hash));
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, []);

  useEffect(() => {
    const label = TABS.find((tab) => tab.id === view)?.label ?? "Overview";
    document.title = `${label} · Campaign Intelligence`;
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

  const openWorkflowGuide = () => {
    const scrollToWorkflow = () =>
      document.getElementById("workflow-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (view === "dashboard") scrollToWorkflow();
    else {
      navigate("dashboard");
      window.setTimeout(scrollToWorkflow, 80);
    }
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
          <span className="brand-title">Campaign Intelligence</span>
        </a>

        <div className="sidebar-context">
          <span className="sidebar-context-label">Evidence-led campaign workspace</span>
          <span
            className={`sidebar-status calendar-trigger ${clientId === null ? "is-idle" : "is-active"}`}
            tabIndex={0}
          >
            <i aria-hidden="true" />
            Marketing campaign calendar
          </span>
          <WorkspaceCalendar />
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
          <div className="sidebar-help-heading">
            <span className="sidebar-loop-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M8.5 15.5h7M9 18h6M10 21h4" strokeLinecap="round" />
                <path d="M8.2 14.2a7 7 0 1 1 7.6 0c-.8.6-1.3 1.1-1.3 1.8H9.5c0-.7-.5-1.2-1.3-1.8Z" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="sidebar-help-title">Need help?</p>
          </div>
          <p className="sidebar-help-copy">
            Turn customer evidence into effective campaigns.
          </p>
          <button
            type="button"
            className="sidebar-guide-button"
            onClick={openWorkflowGuide}
          >
            View guide <span aria-hidden="true">→</span>
          </button>
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
            <span className="brand-title">Campaign Intelligence</span>
          </a>
          <span className={`mobile-client ${clientId === null ? "is-idle" : "is-active"}`}>
            {clientId === null ? "No client" : `Client #${clientName || clientId}`}
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
            <Dashboard
              selectedClientId={clientId}
              selectedClientName={clientName}
              hasInsights={latestInsights.length > 0}
              onNavigate={navigate}
            />
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
              clientName={clientName}
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
          {view === "campaign-calendar" && (
            <CampaignCalendar onNavigate={navigate} />
          )}
          {view === "sources" && <SourcesMethodology />}
        </div>
      </div>
    </div>
  );
}
