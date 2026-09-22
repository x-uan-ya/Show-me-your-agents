import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { api } from "./api/client";

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
    vi.spyOn(api, "listClients").mockResolvedValue([clientRecord]);
    vi.spyOn(api, "getClient").mockResolvedValue(clientRecord);
    vi.spyOn(api, "getMarketingBrief").mockResolvedValue(briefRecord);
    vi.spyOn(api, "saveMarketingBrief").mockImplementation(
      async (_clientId, brief) => ({ ...briefRecord, ...brief }),
    );
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
  });

  it("clears the active client and its browser cache after deletion", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/campaign-calendar";
    window.localStorage.setItem("customer-intelligence:anonymous:selected-client-name", clientRecord.name);
    window.localStorage.setItem(
      "customer-intelligence:anonymous:analysis:7",
      JSON.stringify({ datasetId: 9, insights: [] }),
    );
    vi.spyOn(api, "listCalendarItems").mockResolvedValue([{
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
});
