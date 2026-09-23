import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "../api/client";
import type { AnalyseResponse, Dataset } from "../types";
import { Insights } from "./Insights";


const dataset: Dataset = {
  id: 3,
  client_id: 1,
  name: "Ready feedback",
  source_type: "csv",
  filename: "feedback.csv",
  status: "ready",
  record_count: 12,
  uploaded_at: "2026-09-23T00:00:00Z",
};

const analysisResponse: AnalyseResponse = {
  analysis_run: {
    id: 9,
    client_id: 1,
    dataset_id: dataset.id,
    status: "completed",
    model_provider: "mock",
    model_name: "deterministic",
    started_at: "2026-09-23T00:00:00Z",
    completed_at: "2026-09-23T00:00:01Z",
    error_message: null,
  },
  insights: [],
  rejected: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

function renderInsights(onAnalysisComplete = vi.fn()) {
  render(
    <Insights
      clientId={1}
      datasetId={dataset.id}
      initialInsights={[]}
      onClientChange={vi.fn()}
      onDatasetChange={vi.fn()}
      onNavigate={vi.fn()}
      onAnalysisComplete={onAnalysisComplete}
    />,
  );
  return onAnalysisComplete;
}

describe("Insights analysis abuse UX", () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(api, "listClients").mockResolvedValue([{
      id: 1,
      name: "Northstar",
      industry: null,
      description: null,
      created_at: "2026-09-23T00:00:00Z",
      updated_at: "2026-09-23T00:00:00Z",
    }]);
    vi.spyOn(api, "listDatasets").mockResolvedValue([dataset]);
    vi.spyOn(api, "listSignals").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a useful message when AI analysis is rate-limited", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "analyse").mockRejectedValue(
      new ApiError("Too many requests. Please try again later.", 429, 600),
    );
    renderInsights();

    await user.click(await screen.findByRole("button", { name: "Analyse dataset" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI analysis usage is temporarily limited. Please wait before running another analysis.",
    );
  });

  it("prevents duplicate submissions while a normal analysis is running", async () => {
    const user = userEvent.setup();
    const pending = deferred<AnalyseResponse>();
    const analyse = vi.spyOn(api, "analyse").mockReturnValue(pending.promise);
    const onAnalysisComplete = renderInsights();

    await user.click(await screen.findByRole("button", { name: "Analyse dataset" }));
    const busyButton = await screen.findByRole("button", { name: "Analysing..." });
    expect(busyButton).toBeDisabled();
    await user.click(busyButton);
    expect(analyse).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(analysisResponse));
    await waitFor(() => expect(onAnalysisComplete).toHaveBeenCalledWith(analysisResponse));
    expect(await screen.findByRole("button", { name: "Analyse dataset" })).toBeEnabled();
  });
});
