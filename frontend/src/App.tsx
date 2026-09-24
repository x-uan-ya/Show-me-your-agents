import { useCallback, useEffect, useRef, useState } from "react";

import { api, isAbortError } from "./api/client";
import { useOptionalAuth } from "./auth/AuthContext";
import { Dashboard } from "./pages/Dashboard";
import { CampaignPlan } from "./pages/CampaignPlan";
import { CampaignCalendar } from "./pages/CampaignCalendar";
import { ImportData } from "./pages/ImportData";
import { Insights } from "./pages/Insights";
import { TrialVsRetention } from "./pages/TrialVsRetention";
import { TeamAccess } from "./pages/TeamAccess";
import { WorkflowProgress } from "./components/WorkflowProgress";
import {
  EMPTY_MARKETING_BRIEF,
  type AnalyseResponse,
  type AnalysisRun,
  type AppView,
  type CampaignCalendarItem,
  type Insight,
  type MarketingBrief,
  type WorkflowStatus,
} from "./types";
import { clientIdFromHash, hashForView, viewFromHash } from "./utils/navigation";
import { CAMPAIGN_CALENDAR_UPDATED_EVENT, clientActivityColorStyle } from "./utils/campaignColors";

const CLIENT_STORAGE_SUFFIX = "selected-client";
const CLIENT_NAME_STORAGE_SUFFIX = "selected-client-name";
const BRIEF_STORAGE_PREFIX = "brief:";
const BRIEF_DIRTY_STORAGE_PREFIX = "brief-dirty:";
const ANALYSIS_STORAGE_PREFIX = "analysis:";

type BriefSaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";
type RestoreStatus = "idle" | "loading" | "ready" | "error";

function workspaceStorageKey(scope: string, suffix: string): string {
  return `customer-intelligence:${scope}:${suffix}`;
}

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
  { id: "team-access", label: "Team access", shortLabel: "Team" },
];

const NAV_ICON_PATHS: Record<AppView, string> = {
  dashboard: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M9 19.5v-5h6v5",
  import: "M12 3v12m0 0 4-4m-4 4-4-4M4 18.5V21h16v-2.5",
  insights: "M5 20v-6m7 6V8m7 12V4M3 20h18",
  "campaign-plan": "m4 12 16-8-6 16-3-6-7-2Zm7 2 9-10",
  "trial-retention": "M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3",
  "campaign-calendar": "M5 4h14v16H5zM8 2v4m8-4v4M5 9h14M8 13h3m2 0h3M8 17h3",
  "team-access": "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.5 2.5 0 1 0 0-5M3 20v-2a5 5 0 0 1 10 0v2m1-7a4 4 0 0 1 6 3.5V20",
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

function WorkspaceCalendar({ refreshKey }: { refreshKey: AppView }) {
  const today = new Date();
  const month = today.toLocaleString("en-US", { month: "long" });
  const year = today.getFullYear();
  const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
  const firstDay = new Date(year, today.getMonth(), 1).getDay();
  const days = Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : index - firstDay + 1,
  );
  const [campaignItems, setCampaignItems] = useState<CampaignCalendarItem[]>([]);

  useEffect(() => {
    let controller: AbortController | null = null;
    const loadItems = () => {
      controller?.abort();
      controller = new AbortController();
      api.listCalendarItems({}, controller.signal)
        .then(setCampaignItems)
        .catch((reason) => {
          if (!isAbortError(reason)) {
            // Keep the last rendered schedule while a refresh is temporarily unavailable.
          }
        });
    };
    loadItems();
    window.addEventListener(CAMPAIGN_CALENDAR_UPDATED_EVENT, loadItems);
    return () => {
      controller?.abort();
      window.removeEventListener(CAMPAIGN_CALENDAR_UPDATED_EVENT, loadItems);
    };
  }, [refreshKey]);

  const clientColorById = new Map(
    Array.from(new Set(campaignItems.map((item) => item.client_id)))
      .sort((left, right) => left - right)
      .map((id, index) => [id, index % 6]),
  );
  const monthPrefix = `${year}-${String(today.getMonth() + 1).padStart(2, "0")}-`;

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
        {days.map((day, index) => {
          const date = day === null ? null : `${monthPrefix}${String(day).padStart(2, "0")}`;
          const dayItems = date === null ? [] : campaignItems.filter((item) => item.publish_date === date);
          return (
            <span key={index} className={`${day === today.getDate() ? "is-today" : ""} ${dayItems.length > 0 ? "has-activity" : ""}`}>
              <b>{day ?? ""}</b>
              {dayItems.length > 0 && (
                <i className="workspace-calendar-activity-dots" aria-label={`${dayItems.length} campaign activities`}>
                  {dayItems.slice(0, 3).map((item) => (
                    <em key={item.id} style={clientActivityColorStyle(clientColorById.get(item.client_id) ?? 0)} />
                  ))}
                </i>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function storedClientId(scope: string): number | null {
  const value = window.localStorage.getItem(
    workspaceStorageKey(scope, CLIENT_STORAGE_SUFFIX),
  );
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function initialClientId(scope: string): number | null {
  return clientIdFromHash(window.location.hash) ?? storedClientId(scope);
}

function initialClientName(scope: string): string {
  const routeClientId = clientIdFromHash(window.location.hash);
  const cachedClientId = storedClientId(scope);
  if (routeClientId !== null && routeClientId !== cachedClientId) return "";
  if (routeClientId === null && cachedClientId === null) return "";
  return window.localStorage.getItem(
    workspaceStorageKey(scope, CLIENT_NAME_STORAGE_SUFFIX),
  ) ?? "";
}

function briefDirtyKey(scope: string, clientId: number): string {
  return workspaceStorageKey(scope, `${BRIEF_DIRTY_STORAGE_PREFIX}${clientId}`);
}

function isStoredBriefDirty(scope: string, clientId: number): boolean {
  return window.localStorage.getItem(briefDirtyKey(scope, clientId)) === "1";
}

function storedBrief(scope: string, clientId: number | null): MarketingBrief {
  if (clientId === null) return EMPTY_MARKETING_BRIEF;
  try {
    const raw = window.localStorage.getItem(
      workspaceStorageKey(scope, `${BRIEF_STORAGE_PREFIX}${clientId}`),
    );
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

function storedAnalysis(scope: string, clientId: number | null): { datasetId: number | null; insights: Insight[] } {
  if (clientId === null) return { datasetId: null, insights: [] };
  try {
    const raw = window.localStorage.getItem(
      workspaceStorageKey(scope, `${ANALYSIS_STORAGE_PREFIX}${clientId}`),
    );
    if (!raw) return { datasetId: null, insights: [] };
    const parsed = JSON.parse(raw) as { datasetId?: unknown; insights?: unknown };
    return {
      datasetId: typeof parsed.datasetId === "number" ? parsed.datasetId : null,
      insights: Array.isArray(parsed.insights) ? parsed.insights as Insight[] : [],
    };
  } catch {
    return { datasetId: null, insights: [] };
  }
}

function saveAnalysis(
  scope: string,
  clientId: number | null,
  datasetId: number | null,
  insights: Insight[],
) {
  if (clientId === null) return;
  window.localStorage.setItem(
    workspaceStorageKey(scope, `${ANALYSIS_STORAGE_PREFIX}${clientId}`),
    JSON.stringify({ datasetId, insights }),
  );
}

export default function App() {
  const auth = useOptionalAuth();
  const storageScope = auth?.currentUser
    ? `workspace-${auth.currentUser.workspace_id}:user-${auth.currentUser.id}`
    : "anonymous";
  const [view, setView] = useState<AppView>(() =>
    viewFromHash(window.location.hash),
  );
  const [clientId, setClientId] = useState<number | null>(() => initialClientId(storageScope));
  const [clientName, setClientName] = useState(() => initialClientName(storageScope));
  const [datasetId, setDatasetId] = useState<number | null>(() =>
    storedAnalysis(storageScope, initialClientId(storageScope)).datasetId
  );
  const [brief, setBrief] = useState<MarketingBrief>(() =>
    storedBrief(storageScope, initialClientId(storageScope)),
  );
  const [briefHydratedClientId, setBriefHydratedClientId] = useState<number | null>(null);
  const [briefSaveStatus, setBriefSaveStatus] = useState<BriefSaveStatus>("idle");
  const [briefSaveError, setBriefSaveError] = useState<string | null>(null);
  const [briefSaveRetryVersion, setBriefSaveRetryVersion] = useState(0);
  const [latestInsights, setLatestInsights] = useState<Insight[]>(() =>
    storedAnalysis(storageScope, initialClientId(storageScope)).insights
  );
  const [latestAnalysisRun, setLatestAnalysisRun] = useState<AnalysisRun | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [workflowRestoreStatus, setWorkflowRestoreStatus] = useState<RestoreStatus>(
    clientId === null ? "idle" : "loading",
  );
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowRefreshVersion, setWorkflowRefreshVersion] = useState(0);
  const hasMounted = useRef(false);
  const briefEditVersion = useRef(0);
  const visibleTabs = TABS.filter((tab) =>
    tab.id !== "team-access" || auth?.currentUser?.role === "admin"
  );

  const selectClient = useCallback((nextClientId: number | null, updateRoute = true) => {
    if (clientId !== nextClientId) {
      const restored = storedAnalysis(storageScope, nextClientId);
      briefEditVersion.current += 1;
      setClientName("");
      setDatasetId(restored.datasetId);
      setLatestInsights(
        nextClientId === null
          ? []
          : restored.insights.filter((insight) => insight.client_id === nextClientId),
      );
      setLatestAnalysisRun(null);
      setWorkflowStatus(null);
      setWorkflowError(null);
      setWorkflowRestoreStatus(nextClientId === null ? "idle" : "loading");
      setBriefHydratedClientId(null);
      setBrief(storedBrief(storageScope, nextClientId));
      setBriefSaveStatus(
        nextClientId !== null && isStoredBriefDirty(storageScope, nextClientId)
          ? "unsaved"
          : "idle",
      );
      setBriefSaveError(null);
    }
    setClientId(nextClientId);
    if (nextClientId === null) {
      window.localStorage.removeItem(workspaceStorageKey(storageScope, CLIENT_STORAGE_SUFFIX));
      window.localStorage.removeItem(workspaceStorageKey(storageScope, CLIENT_NAME_STORAGE_SUFFIX));
    } else {
      window.localStorage.setItem(
        workspaceStorageKey(storageScope, CLIENT_STORAGE_SUFFIX),
        String(nextClientId),
      );
    }
    if (updateRoute) {
      const nextHash = hashForView(view, nextClientId);
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
    }
  }, [clientId, storageScope, view]);

  useEffect(() => {
    const syncView = () => {
      setView(viewFromHash(window.location.hash));
      const routeClientId = clientIdFromHash(window.location.hash);
      if (routeClientId !== null && routeClientId !== clientId) {
        selectClient(routeClientId, false);
      }
    };
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, [clientId, selectClient]);

  useEffect(() => {
    if (view === "team-access" && auth?.currentUser?.role !== "admin") {
      window.location.hash = hashForView("dashboard", clientId);
    }
  }, [auth?.currentUser?.role, clientId, view]);

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

  useEffect(() => {
    if (clientId === null) {
      setClientName("");
      return;
    }

    const controller = new AbortController();
    api.getClient(clientId, controller.signal)
      .then((client) => {
        if (controller.signal.aborted) return;
        setClientName(client.name);
        window.localStorage.setItem(
          workspaceStorageKey(storageScope, CLIENT_NAME_STORAGE_SUFFIX),
          client.name,
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          // Keep the cached label while offline; client-owned API calls still use the ID.
        }
      });
    return () => controller.abort();
  }, [clientId, storageScope]);

  useEffect(() => {
    setBriefHydratedClientId(null);
    setBriefSaveError(null);
    if (clientId === null) {
      setBrief(EMPTY_MARKETING_BRIEF);
      setBriefSaveStatus("idle");
      return;
    }

    const fallback = storedBrief(storageScope, clientId);
    const hasUnsavedDraft = isStoredBriefDirty(storageScope, clientId);
    setBrief(fallback);
    setBriefSaveStatus(hasUnsavedDraft ? "unsaved" : "idle");
    const loadVersion = briefEditVersion.current;
    const controller = new AbortController();
    api.getMarketingBrief(clientId, controller.signal)
      .then((record) => {
        if (controller.signal.aborted) return;
        if (!hasUnsavedDraft && briefEditVersion.current === loadVersion) {
          if (record) {
            const persistedBrief: MarketingBrief = {
              objective: record.objective,
              target_audience: record.target_audience,
              current_message: record.current_message,
              channels: record.channels,
            };
            setBrief(persistedBrief);
            window.localStorage.setItem(
              workspaceStorageKey(storageScope, `${BRIEF_STORAGE_PREFIX}${clientId}`),
              JSON.stringify(persistedBrief),
            );
            setBriefSaveStatus("saved");
          } else {
            setBrief(EMPTY_MARKETING_BRIEF);
            window.localStorage.removeItem(
              workspaceStorageKey(storageScope, `${BRIEF_STORAGE_PREFIX}${clientId}`),
            );
            setBriefSaveStatus("idle");
          }
        }
        setBriefHydratedClientId(clientId);
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setBriefSaveError("Unable to load the saved brief. The local draft remains available.");
          if (hasUnsavedDraft) setBriefSaveStatus("error");
          setBriefHydratedClientId(clientId);
        }
      });
    return () => controller.abort();
  }, [clientId, storageScope]);

  useEffect(() => {
    if (
      clientId === null ||
      briefHydratedClientId !== clientId ||
      !isStoredBriefDirty(storageScope, clientId)
    ) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setBriefSaveStatus("saving");
      setBriefSaveError(null);
      void api.saveMarketingBrief(clientId, brief, controller.signal)
        .then(() => {
          if (controller.signal.aborted) return;
          window.localStorage.removeItem(briefDirtyKey(storageScope, clientId));
          setBriefSaveStatus("saved");
          setWorkflowRefreshVersion((value) => value + 1);
        })
        .catch((error) => {
          if (!controller.signal.aborted && !isAbortError(error)) {
            setBriefSaveStatus("error");
            setBriefSaveError("Unable to save the brief. Your local draft is preserved; retry when the connection returns.");
          }
        });
    }, 500);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [brief, briefHydratedClientId, briefSaveRetryVersion, clientId, storageScope]);

  useEffect(() => {
    if (clientId === null) {
      setWorkflowStatus(null);
      setWorkflowError(null);
      setWorkflowRestoreStatus("idle");
      return;
    }

    const controller = new AbortController();
    setWorkflowRestoreStatus("loading");
    setWorkflowError(null);
    void Promise.allSettled([
      api.getWorkflowStatus(clientId, controller.signal),
      api.latestAnalysis(clientId, controller.signal),
    ]).then(([statusResult, analysisResult]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];

      if (statusResult.status === "fulfilled") {
        if (statusResult.value.client_id !== clientId) {
          errors.push("Workflow status belongs to a different client.");
        } else {
          setWorkflowStatus(statusResult.value);
          setClientName(statusResult.value.client_name);
          window.localStorage.setItem(
            workspaceStorageKey(storageScope, CLIENT_NAME_STORAGE_SUFFIX),
            statusResult.value.client_name,
          );
        }
      } else if (!isAbortError(statusResult.reason)) {
        errors.push((statusResult.reason as Error).message);
      }

      if (analysisResult.status === "fulfilled") {
        const restored = analysisResult.value;
        if (restored && restored.analysis_run.client_id !== clientId) {
          errors.push("Latest analysis belongs to a different client.");
        } else if (restored) {
          setLatestAnalysisRun(restored.analysis_run);
          setLatestInsights(restored.insights);
          setDatasetId(restored.analysis_run.dataset_id);
          saveAnalysis(
            storageScope,
            clientId,
            restored.analysis_run.dataset_id,
            restored.insights,
          );
        } else {
          setLatestAnalysisRun(null);
          setLatestInsights([]);
          if (statusResult.status === "fulfilled") {
            setDatasetId(statusResult.value.latest_dataset_id);
          }
          saveAnalysis(
            storageScope,
            clientId,
            statusResult.status === "fulfilled" ? statusResult.value.latest_dataset_id : null,
            [],
          );
        }
      } else if (!isAbortError(analysisResult.reason)) {
        errors.push((analysisResult.reason as Error).message);
      }

      if (errors.length > 0) {
        setWorkflowError(errors.join(" "));
        setWorkflowRestoreStatus("error");
      } else {
        setWorkflowRestoreStatus("ready");
      }
    });

    return () => controller.abort();
  }, [clientId, storageScope, workflowRefreshVersion]);

  useEffect(() => {
    if (!(["unsaved", "saving", "error"] as BriefSaveStatus[]).includes(briefSaveStatus)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [briefSaveStatus]);

  const navigate = (next: AppView) => {
    const nextHash = hashForView(next, clientId);
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

  const removeDeletedClientContext = (deletedClientId: number) => {
    window.localStorage.removeItem(
      workspaceStorageKey(storageScope, `${BRIEF_STORAGE_PREFIX}${deletedClientId}`),
    );
    window.localStorage.removeItem(
      workspaceStorageKey(storageScope, `${ANALYSIS_STORAGE_PREFIX}${deletedClientId}`),
    );
    window.localStorage.removeItem(briefDirtyKey(storageScope, deletedClientId));
    if (clientId !== deletedClientId) return;

    briefEditVersion.current += 1;
    setBriefHydratedClientId(null);
    setBrief(EMPTY_MARKETING_BRIEF);
    setDatasetId(null);
    setLatestInsights([]);
    setLatestAnalysisRun(null);
    setWorkflowStatus(null);
    setWorkflowRestoreStatus("idle");
    setWorkflowError(null);
    setBriefSaveStatus("idle");
    setBriefSaveError(null);
    setClientName("");
    setClientId(null);
    window.localStorage.removeItem(workspaceStorageKey(storageScope, CLIENT_STORAGE_SUFFIX));
    window.localStorage.removeItem(workspaceStorageKey(storageScope, CLIENT_NAME_STORAGE_SUFFIX));
    window.location.hash = hashForView(view);
  };

  const updateBrief = (nextBrief: MarketingBrief) => {
    briefEditVersion.current += 1;
    setBrief(nextBrief);
    if (clientId !== null) {
      window.localStorage.setItem(
        workspaceStorageKey(storageScope, `${BRIEF_STORAGE_PREFIX}${clientId}`),
        JSON.stringify(nextBrief),
      );
      window.localStorage.setItem(briefDirtyKey(storageScope, clientId), "1");
      setBriefSaveStatus("unsaved");
      setBriefSaveError(null);
    }
  };

  const openImportedDataset = (nextDatasetId: number) => {
    setDatasetId(nextDatasetId);
    setWorkflowRefreshVersion((value) => value + 1);
    navigate("insights");
  };

  const changeDataset = (nextDatasetId: number | null) => {
    setDatasetId(nextDatasetId);
  };

  const storeLatestAnalysis = (response: AnalyseResponse) => {
    setLatestAnalysisRun(response.analysis_run);
    setDatasetId(response.analysis_run.dataset_id);
    setLatestInsights(response.insights);
    saveAnalysis(storageScope, clientId, response.analysis_run.dataset_id, response.insights);
    setWorkflowRefreshVersion((value) => value + 1);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>

      <aside className="app-sidebar">
        <a
          href={hashForView("dashboard", clientId)}
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
          <WorkspaceCalendar refreshKey={view} />
        </div>

        <nav aria-label="Primary navigation" className="app-nav">
          <p className="app-nav-label">Workspace</p>
          {visibleTabs.map((tab, index) => (
            <a
              key={tab.id}
              href={hashForView(tab.id, clientId)}
              aria-current={view === tab.id ? "page" : undefined}
              className={`app-nav-link ${view === tab.id ? "is-active" : ""}`}
            >
              <NavIcon view={tab.id} />
              <span>{tab.label}</span>
              <small>{String(index + 1).padStart(2, "0")}</small>
            </a>
          ))}
        </nav>

        {auth?.currentUser && (
          <section className="sidebar-user" aria-label="Signed in user">
            <div className="sidebar-user-identity">
              <span className="sidebar-user-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" strokeLinecap="round" />
                </svg>
              </span>
              <strong>{auth.currentUser.display_name}</strong>
            </div>
            <div className="sidebar-user-details">
              <span>{auth.currentUser.workspace_name} · {auth.currentUser.role}</span>
            </div>
            <button className="sidebar-user-logout" type="button" onClick={() => void auth.logout()} title="Logout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Logout</span>
            </button>
            {auth.currentUser.workspaces.length > 1 && (
              <select
                aria-label="Workspace"
                value={auth.currentUser.workspace_id}
                onChange={(event) => void auth.switchWorkspace(Number(event.target.value))}
              >
                {auth.currentUser.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            )}
          </section>
        )}

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
            href={hashForView("dashboard", clientId)}
            className="app-brand"
            onClick={() => setView("dashboard")}
          >
            <BrandMark />
            <span className="brand-title">Campaign Intelligence</span>
          </a>
          <span className={`mobile-client ${clientId === null ? "is-idle" : "is-active"}`}>
            {clientId === null ? "No client" : `Client #${clientName || clientId}`}
          </span>
          {auth?.currentUser && (
            <button className="mobile-logout" type="button" onClick={() => void auth.logout()}>
              Logout
            </button>
          )}
        </header>

        <nav aria-label="Mobile navigation" className="mobile-tabs">
          {visibleTabs.map((tab) => (
            <a
              key={tab.id}
              href={hashForView(tab.id, clientId)}
              aria-current={view === tab.id ? "page" : undefined}
              className={view === tab.id ? "is-active" : ""}
            >
              <NavIcon view={tab.id} />
              <span>{tab.shortLabel}</span>
            </a>
          ))}
        </nav>

        <div id="workspace-content" tabIndex={-1}>
          {clientId !== null && view !== "team-access" && (
            <WorkflowProgress
              clientName={clientName || `Client #${clientId}`}
              currentView={view}
              status={workflowStatus}
              loading={workflowRestoreStatus === "loading"}
              error={workflowError}
              onNavigate={navigate}
              onRetry={() => setWorkflowRefreshVersion((value) => value + 1)}
            />
          )}
          {view === "dashboard" && (
            <Dashboard
              selectedClientId={clientId}
              selectedClientName={clientName}
              hasInsights={latestInsights.length > 0}
              workflowStatus={workflowStatus}
              onNavigate={navigate}
            />
          )}
          {view === "import" && (
            <ImportData
              key={clientId ?? "no-client"}
              clientId={clientId}
              brief={brief}
              onClientChange={selectClient}
              onBriefChange={updateBrief}
              briefSaveStatus={briefSaveStatus}
              briefSaveError={briefSaveError}
              onRetryBriefSave={() => setBriefSaveRetryVersion((value) => value + 1)}
              onDataImported={(nextDatasetId) => {
                setDatasetId(nextDatasetId);
                setWorkflowRefreshVersion((value) => value + 1);
              }}
              onReadyToAnalyse={openImportedDataset}
            />
          )}
          {view === "insights" && (
            <Insights
              key={clientId ?? "no-client"}
              clientId={clientId}
              datasetId={datasetId}
              initialInsights={latestInsights}
              initialAnalysisRun={latestAnalysisRun}
              restoreStatus={workflowRestoreStatus}
              restoreError={workflowError}
              workflowStatus={workflowStatus}
              onClientChange={selectClient}
              onDatasetChange={changeDataset}
              onNavigate={navigate}
              onRetryRestore={() => setWorkflowRefreshVersion((value) => value + 1)}
              onAnalysisComplete={storeLatestAnalysis}
            />
          )}
          {view === "campaign-plan" && (
            <CampaignPlan
              key={clientId ?? "no-client"}
              clientId={clientId}
              clientName={clientName}
              brief={brief}
              insights={latestInsights}
              restoreStatus={workflowRestoreStatus}
              workflowStatus={workflowStatus}
              onWorkflowChanged={() => setWorkflowRefreshVersion((value) => value + 1)}
              onNavigate={navigate}
            />
          )}
          {view === "trial-retention" && (
            <TrialVsRetention
              key={clientId ?? "no-client"}
              clientId={clientId}
              onClientChange={selectClient}
            />
          )}
          {view === "campaign-calendar" && (
            <CampaignCalendar
              key={clientId ?? "all-clients"}
              selectedClientId={clientId}
              onNavigate={navigate}
              onClientDeleted={removeDeletedClientContext}
              onWorkflowChanged={() => setWorkflowRefreshVersion((value) => value + 1)}
            />
          )}
          {view === "team-access" && auth?.currentUser?.role === "admin" && (
            <TeamAccess />
          )}
        </div>
      </div>
    </div>
  );
}
