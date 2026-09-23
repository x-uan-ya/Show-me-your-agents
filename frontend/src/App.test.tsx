import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { api } from "./api/client";
import type { AnalyseResponse, Insight, WorkflowStatus } from "./types";

const clientRecord = {
  id: 7,
  name: "Backend Bistro",
  industry: "F&B",
  description: null,
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
};

const briefRecord = {
  id: 31,
  client_id: 7,
  objective: "Increase weekday lunch traffic",
  target_audience: "CBD office workers",
  current_message: "Premium artisanal dining",
  channels: ["Instagram"],
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-21T00:00:00Z",
};

const secondClientRecord = {
  ...clientRecord,
  id: 8,
  name: "TechStart",
};

function insightFor(clientId: number, title: string): Insight {
  return {
    id: clientId * 10,
    client_id: clientId,
    analysis_run_id: clientId * 100,
    title,
    summary: `${title} summary`,
    category: "PURCHASE_DRIVER",
    confidence: 0.88,
    confidence_label: "High",
    evidence_count: 1,
    reasoning_summary: null,
    evidence: [{ signal_id: clientId * 1000, excerpt: `${title} evidence`, relevance_score: 0.9 }],
  };
}

function analysisFor(clientId: number, title: string): AnalyseResponse {
  return {
    analysis_run: {
      id: clientId * 100,
      client_id: clientId,
      dataset_id: clientId * 1000,
      status: "completed",
      model_provider: "mock",
      model_name: "deterministic",
      started_at: "2026-09-22T00:00:00Z",
      completed_at: "2026-09-22T00:00:01Z",
      error_message: null,
    },
    insights: [insightFor(clientId, title)],
    rejected: [],
  };
}

function workflowFor(
  clientId: number,
  overrides: Partial<WorkflowStatus> = {},
): WorkflowStatus {
  const name = clientId === secondClientRecord.id ? secondClientRecord.name : clientRecord.name;
  return {
    client_id: clientId,
    client_name: name,
    client: true,
    brief: true,
    data: true,
    analysis: true,
    insights: true,
    campaign: false,
    approval: false,
    schedule: false,
    latest_dataset_id: clientId * 1000,
    latest_analysis_run_id: clientId * 100,
    latest_campaign_id: null,
    insight_count: 1,
    scheduled_item_count: 0,
    recommended_next_step: "campaign",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => { resolve = fulfil; });
  return { promise, resolve };
}

describe("App marketing brief persistence", () => {
  beforeEach(() => {
    window.location.hash = "#/import";
    window.localStorage.setItem("customer-intelligence:anonymous:selected-client", "7");
    window.localStorage.setItem(
      "customer-intelligence:anonymous:brief:7",
      JSON.stringify({
        objective: "Stale browser objective",
        target_audience: "Stale audience",
        current_message: "Stale message",
        channels: ["Email"],
      }),
    );
    vi.spyOn(api, "listClients").mockResolvedValue([clientRecord, secondClientRecord]);
    vi.spyOn(api, "getClient").mockImplementation(async (clientId) =>
      clientId === secondClientRecord.id ? secondClientRecord : clientRecord
    );
    vi.spyOn(api, "getMarketingBrief").mockResolvedValue(briefRecord);
    vi.spyOn(api, "saveMarketingBrief").mockImplementation(
      async (_clientId, brief) => ({ ...briefRecord, ...brief }),
    );
    vi.spyOn(api, "getWorkflowStatus").mockImplementation(async (clientId) => workflowFor(clientId));
    vi.spyOn(api, "latestAnalysis").mockResolvedValue(null);
    vi.spyOn(api, "listDatasets").mockResolvedValue([]);
    vi.spyOn(api, "listSignals").mockResolvedValue([]);
    vi.spyOn(api, "listCalendarItems").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("loads the backend brief over stale browser data and autosaves edits", async () => {
    const user = userEvent.setup();
    render(<App />);

    const objective = await screen.findByDisplayValue(briefRecord.objective);
    expect(api.getMarketingBrief).toHaveBeenCalledWith(7, expect.any(AbortSignal));
    expect(screen.getByDisplayValue(briefRecord.target_audience)).toBeInTheDocument();
    expect(screen.getByDisplayValue(briefRecord.current_message)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Instagram" })).toBeChecked();

    await user.clear(objective);
    await user.type(objective, "Increase repeat visits");

    await waitFor(() => {
      expect(api.saveMarketingBrief).toHaveBeenLastCalledWith(
        7,
        expect.objectContaining({ objective: "Increase repeat visits" }),
        expect.any(AbortSignal),
      );
    }, { timeout: 1500 });
    expect(JSON.parse(
      window.localStorage.getItem("customer-intelligence:anonymous:brief:7") ?? "{}",
    )).toMatchObject({ objective: "Increase repeat visits" });

    await user.click(screen.getAllByRole("link", { name: /^Customer insights/ })[0]);
    await screen.findByRole("heading", { name: "Customer insights" });
    await user.click(screen.getAllByRole("link", { name: /^Import signals/ })[0]);
    expect(await screen.findByDisplayValue("Increase repeat visits")).toBeInTheDocument();
  });

  it("clears the active client and its browser cache after deletion", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/campaign-calendar";
    window.localStorage.setItem("customer-intelligence:anonymous:selected-client-name", clientRecord.name);
    window.localStorage.setItem(
      "customer-intelligence:anonymous:analysis:7",
      JSON.stringify({ datasetId: 9, insights: [] }),
    );
    vi.mocked(api.listCalendarItems).mockResolvedValue([{
      id: 101,
      campaign_id: 11,
      campaign_name: "Lunch Campaign",
      campaign_status: "draft",
      client_id: clientRecord.id,
      client_name: clientRecord.name,
      channel: "Instagram",
      publish_date: "2026-09-22",
      status: "draft",
      content: "Lunch post",
      content_type: "Awareness",
      cta: null,
      owner: null,
    }]);
    vi.spyOn(api, "deleteClient").mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Delete customer" }));

    await waitFor(() => expect(api.deleteClient).toHaveBeenCalledWith(7));
    expect(screen.getByText("No client")).toBeInTheDocument();
    expect(window.localStorage.getItem("customer-intelligence:anonymous:selected-client")).toBeNull();
    expect(window.localStorage.getItem("customer-intelligence:anonymous:selected-client-name")).toBeNull();
    expect(window.localStorage.getItem("customer-intelligence:anonymous:brief:7")).toBeNull();
    expect(window.localStorage.getItem("customer-intelligence:anonymous:analysis:7")).toBeNull();
  });

  it("restores a client and its latest insights from a direct deep link", async () => {
    const restored = analysisFor(7, "Lunch convenience drives visits");
    window.location.hash = "#/clients/7/insights";
    vi.mocked(api.latestAnalysis).mockResolvedValue(restored);
    vi.mocked(api.listDatasets).mockResolvedValue([{
      id: restored.analysis_run.dataset_id,
      client_id: 7,
      name: "Lunch feedback",
      source_type: "csv",
      filename: "feedback.csv",
      status: "ready",
      record_count: 12,
      uploaded_at: "2026-09-22T00:00:00Z",
    }]);

    render(<App />);

    expect(await screen.findByText("Lunch convenience drives visits")).toBeInTheDocument();
    expect(screen.getByText("Run #700 · completed")).toBeInTheDocument();
    expect(api.latestAnalysis).toHaveBeenCalledWith(7, expect.any(AbortSignal));
    expect(window.location.hash).toBe("#/clients/7/insights");
  });

  it("guides a deep-linked client to analysis without clearing its saved brief", async () => {
    window.location.hash = "#/clients/7/insights";
    vi.mocked(api.getWorkflowStatus).mockResolvedValue(workflowFor(7, {
      analysis: false,
      insights: false,
      latest_analysis_run_id: null,
      insight_count: 0,
      recommended_next_step: "analysis",
    }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Customer feedback is ready" })).toBeInTheDocument();
    expect(screen.getByText(/Your Marketing Brief is saved/)).toBeInTheDocument();
    expect(screen.queryByText("Select a client to restore its workflow")).not.toBeInTheDocument();
    expect(JSON.parse(
      window.localStorage.getItem("customer-intelligence:anonymous:brief:7") ?? "{}",
    )).toMatchObject({ objective: briefRecord.objective });
  });

  it("shows restoration loading before deciding whether insights are empty", async () => {
    window.location.hash = "#/clients/7/insights";
    const statusRequest = deferred<WorkflowStatus>();
    const analysisRequest = deferred<AnalyseResponse | null>();
    vi.mocked(api.getWorkflowStatus).mockReturnValue(statusRequest.promise);
    vi.mocked(api.latestAnalysis).mockReturnValue(analysisRequest.promise);

    render(<App />);

    expect(await screen.findByText("Loading this client’s latest insights…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Customer feedback is ready" })).not.toBeInTheDocument();

    await act(async () => {
      statusRequest.resolve(workflowFor(7, {
        analysis: false,
        insights: false,
        recommended_next_step: "analysis",
      }));
      analysisRequest.resolve(null);
    });
    expect(await screen.findByRole("heading", { name: "Customer feedback is ready" })).toBeInTheDocument();
  });

  it("reloads isolated persisted data when switching clients and switching back", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/clients/7/insights";
    vi.mocked(api.latestAnalysis).mockImplementation(async (clientId) =>
      clientId === 7
        ? analysisFor(7, "Client A insight")
        : analysisFor(8, "Client B insight")
    );

    render(<App />);
    expect(await screen.findByText("Client A insight")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Client"), "8");
    expect(await screen.findByText("Client B insight")).toBeInTheDocument();
    expect(screen.queryByText("Client A insight")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/clients/8/insights");

    await user.selectOptions(screen.getByLabelText("Client"), "7");
    expect(await screen.findByText("Client A insight")).toBeInTheDocument();
    expect(screen.queryByText("Client B insight")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/clients/7/insights");
  });

  it("keeps cached client insights visible with retry when backend restoration fails", async () => {
    const cachedInsight = insightFor(7, "Cached lunch insight");
    window.location.hash = "#/clients/7/insights";
    window.localStorage.setItem(
      "customer-intelligence:anonymous:analysis:7",
      JSON.stringify({ datasetId: 7000, insights: [cachedInsight] }),
    );
    vi.mocked(api.latestAnalysis).mockRejectedValue(new Error("Network unavailable"));

    render(<App />);

    expect(await screen.findByText("Cached lunch insight")).toBeInTheDocument();
    expect(screen.getByText("Unable to load the latest saved insights.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0);
  });
});
