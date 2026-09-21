import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { CampaignCalendarItem } from "../types";
import { CampaignCalendar } from "./CampaignCalendar";

function localDate(day: number, monthOffset = 0): string {
  const now = new Date();
  const value = new Date(now.getFullYear(), now.getMonth() + monthOffset, day);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function localDateLabel(day: number): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
    .format(new Date(now.getFullYear(), now.getMonth(), day));
}

const records: CampaignCalendarItem[] = [
  {
    id: 101,
    campaign_id: 11,
    campaign_name: "Lunch Rush Recovery",
    campaign_status: "draft",
    client_id: 1,
    client_name: "Sunny Cafe",
    channel: "Instagram",
    publish_date: localDate(3),
    status: "scheduled",
    content: "Skip the Queue Reel",
    content_type: "Reel",
    cta: "Order ahead",
    owner: "Maya",
  },
  {
    id: 102,
    campaign_id: 11,
    campaign_name: "Lunch Rush Recovery",
    campaign_status: "draft",
    client_id: 1,
    client_name: "Sunny Cafe",
    channel: "Email",
    publish_date: localDate(5),
    status: "draft",
    content: "Lunch Promotion",
    content_type: "Newsletter",
    cta: null,
    owner: null,
  },
  {
    id: 103,
    campaign_id: 12,
    campaign_name: "Faster Onboarding",
    campaign_status: "approved",
    client_id: 2,
    client_name: "TechStart",
    channel: "TikTok",
    publish_date: localDate(7),
    status: "published",
    content: "Fast Pickup Video",
    content_type: "Video",
    cta: null,
    owner: "Noah",
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

describe("CampaignCalendar", () => {
  beforeEach(() => {
    vi.spyOn(api, "listCalendarItems").mockResolvedValue(records);
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows a loading state until persisted schedule data arrives", async () => {
    const request = deferred<CampaignCalendarItem[]>();
    vi.mocked(api.listCalendarItems).mockReturnValueOnce(request.promise);
    render(<CampaignCalendar onNavigate={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading campaign schedule");
    request.resolve(records);
    expect(await screen.findByText("Skip the Queue Reel")).toBeInTheDocument();
  });

  it("renders real campaigns, clients, channels, dates and statuses as separate items", async () => {
    render(<CampaignCalendar onNavigate={vi.fn()} />);

    expect(await screen.findByText("Skip the Queue Reel")).toBeInTheDocument();
    expect(screen.getByText("Lunch Promotion")).toBeInTheDocument();
    expect(screen.getAllByText(/Lunch Rush Recovery · Sunny Cafe/)).toHaveLength(2);
    expect(screen.getByText(/Faster Onboarding · TechStart · TikTok/)).toBeInTheDocument();
    expect(screen.getByText(localDateLabel(3))).toHaveAttribute("datetime", localDate(3));
    expect(screen.getByText(localDateLabel(5))).toHaveAttribute("datetime", localDate(5));
    expect(screen.getByText("Scheduled", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Published", { selector: "span" })).toBeInTheDocument();
  });

  it("filters independently by real client, channel and status values", async () => {
    render(<CampaignCalendar onNavigate={vi.fn()} />);
    await screen.findByText("Skip the Queue Reel");

    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "1" } });
    expect(screen.getByText("Lunch Promotion")).toBeInTheDocument();
    expect(screen.queryByText("Fast Pickup Video")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Client"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "Email" } });
    expect(screen.getByText("Lunch Promotion")).toBeInTheDocument();
    expect(screen.queryByText("Skip the Queue Reel")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "published" } });
    expect(screen.getByText("Fast Pickup Video")).toBeInTheDocument();
    expect(screen.queryByText("Lunch Promotion")).not.toBeInTheDocument();
  });

  it("loads previous and next months from the backend", async () => {
    render(<CampaignCalendar onNavigate={vi.fn()} />);
    await screen.findByText("Skip the Queue Reel");

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(api.listCalendarItems).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.listCalendarItems).mock.calls[1][0]).toEqual({
      startDate: localDate(1, -1),
      endDate: localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate(), -1),
    });

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(api.listCalendarItems).toHaveBeenCalledTimes(3));
  });

  it("shows an empty state without static demo fallback records", async () => {
    vi.mocked(api.listCalendarItems).mockResolvedValueOnce([]);
    render(<CampaignCalendar onNavigate={vi.fn()} />);

    expect(await screen.findByText("No campaigns scheduled for this month.")).toBeInTheDocument();
    expect(screen.queryByText("Harbour Brew")).not.toBeInTheDocument();
    expect(screen.queryByText("No scheduling conflicts")).not.toBeInTheDocument();
  });

  it("shows API failures and retries without demo fallback data", async () => {
    vi.mocked(api.listCalendarItems)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(records);
    render(<CampaignCalendar onNavigate={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load campaign schedule.");
    expect(screen.queryByText("Harbour Brew")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Skip the Queue Reel")).toBeInTheDocument();
  });
});
