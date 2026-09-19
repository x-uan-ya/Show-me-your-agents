import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { CampaignGapResponse, CustomerSignal, Insight, MarketingBrief } from "../types";
import { CampaignPlan } from "./CampaignPlan";

const insight: Insight = {
  id: 12,
  client_id: 1,
  analysis_run_id: 4,
  title: "Fast setup matters",
  summary: "Customers value a short setup flow.",
  category: "PURCHASE_DRIVER",
  confidence: 0.8,
  confidence_label: "High",
  evidence_count: 2,
  reasoning_summary: null,
  evidence: [
    { signal_id: 21, excerpt: "It was quick to start.", relevance_score: 0.9 },
  ],
};

const brief: MarketingBrief = {
  objective: "Increase sign-ups",
  target_audience: "SME owners",
  channels: ["LinkedIn", "Email"],
  current_message: "Work smarter",
};

const gap: CampaignGapResponse = {
  client_id: 1,
  campaign: {
    campaign_id: "CAM001",
    objective: brief.objective,
    target_audience: brief.target_audience,
    active_message: brief.current_message,
    channel: "LinkedIn",
  },
  analysis: {
    alignment: "partial",
    summary: "The current message reflects speed but misses customer proof.",
    matched_customer_values: ["Fast setup matters", "Simple onboarding"],
    message_gaps: ["Customer proof is missing", "Setup time is unclear"],
    recommended_actions: ["Add customer proof", "Demonstrate the setup flow"],
    supporting_insight_ids: [12],
  },
};

const signal: CustomerSignal = {
  id: 21,
  client_id: 1,
  dataset_id: 3,
  external_id: null,
  source: "Customer survey",
  date: "2026-01-01",
  text: "The complete feedback: setup took only two minutes.",
  rating: 5,
  product: "Starter plan",
  campaign: null,
  channel: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function renderPlan(insights: Insight[] = [insight]) {
  return render(<CampaignPlan clientId={1} brief={brief} insights={insights} onNavigate={vi.fn()} />);
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Generate campaign plan" }));
  await screen.findByText("Seven-day evidence-led sequence");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

describe("CampaignPlan", () => {
  beforeEach(() => {
    vi.spyOn(api, "analyseCampaignGapAutomatically").mockResolvedValue(gap);
    vi.spyOn(api, "listSignals").mockResolvedValue([signal]);
    vi.spyOn(api, "evidenceQuality").mockResolvedValue({
      insight_id: 12,
      status: "OK",
      confidence: 0.8,
      confidence_label: "High",
      evidence_count: 2,
      independent_evidence_count: 2,
      evidence_coverage: null,
      source_distribution: {},
      flags: [],
      explanation: "Customer feedback supports quick setup.",
      limitations: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("requires evidence before generating a plan", () => {
    renderPlan([]);
    expect(screen.getByText("Customer evidence is required")).toBeInTheDocument();
  });

  it("requires evidence belonging to the active client", () => {
    renderPlan([{ ...insight, client_id: 2 }]);
    expect(screen.getByText("Customer evidence is required")).toBeInTheDocument();
    expect(api.analyseCampaignGapAutomatically).not.toHaveBeenCalled();
  });

  it("shows all gap content in one card alongside the reviewable calendar", async () => {
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    const card = within(screen.getByRole("article", { name: "Customer-Message Gap" }));

    expect(card.getByText(brief.current_message)).toBeInTheDocument();
    expect(card.getByText("Alignment: partial")).toBeInTheDocument();
    for (const text of [gap.analysis.summary, ...gap.analysis.matched_customer_values,
      ...gap.analysis.message_gaps, ...gap.analysis.recommended_actions]) {
      expect(card.getByText(text)).toBeInTheDocument();
      expect(card.getAllByText(text)).toHaveLength(1);
    }
    expect(card.getByText("Citations support the overall analysis.")).toBeInTheDocument();
    expect(screen.queryByText("Messaging strategy")).not.toBeInTheDocument();
    expect(screen.getAllByText("Insight #12").length).toBeGreaterThan(0);
    expect(api.analyseCampaignGapAutomatically).toHaveBeenCalledWith(1, {
      objective: brief.objective,
      target_audience: brief.target_audience,
      active_message: brief.current_message,
      channels: brief.channels,
    }, expect.any(AbortSignal));
    expect(api.listSignals).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Approve campaign" }));
    expect(screen.getByText("Campaign approved")).toBeInTheDocument();
  });

  it("uses gap-analysis values, gaps, and recommendations in the calendar rows", async () => {
    vi.mocked(api.analyseCampaignGapAutomatically).mockResolvedValue({
      ...gap,
      analysis: { ...gap.analysis, matched_customer_values: ["Reliable onboarding"] },
    });
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    const calendar = within(screen.getByRole("table", {
      name: "Seven-day evidence-led campaign content schedule",
    }));
    expect(within(calendar.getByRole("row", { name: /Day 1/ }))
      .getByRole("cell", { name: "Customer proof: Reliable onboarding" })).toBeInTheDocument();
    expect(within(calendar.getByRole("row", { name: /Day 3/ }))
      .getByRole("cell", { name: "Address the concern: Customer proof is missing" })).toBeInTheDocument();
    expect(within(calendar.getByRole("row", { name: /Day 5/ }))
      .getByRole("cell", { name: "Add customer proof" })).toBeInTheDocument();
  });

  it("generates before metadata settles and opens excerpts immediately, then enriches the drawer", async () => {
    const metadata = deferred<CustomerSignal[]>();
    vi.mocked(api.listSignals).mockReturnValue(metadata.promise);
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    expect(api.listSignals).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "Customer-Message Gap" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate campaign plan" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /View evidence for Insight #12/ }));
    expect(api.listSignals).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    const drawer = within(screen.getByRole("dialog", { name: insight.title }));
    expect(drawer.getByText(insight.evidence[0].excerpt, { exact: false })).toBeInTheDocument();
    expect(drawer.queryByText(signal.text, { exact: false })).not.toBeInTheDocument();
    const close = drawer.getByRole("button", { name: "Close evidence panel" });
    expect(close).toHaveFocus();

    await act(async () => metadata.resolve([signal]));
    expect(drawer.getByText(signal.text, { exact: false })).toBeInTheDocument();
    expect(drawer.getByText("Source: Customer survey")).toBeInTheDocument();
    expect(drawer.queryByText(insight.evidence[0].excerpt, { exact: false })).not.toBeInTheDocument();
    expect(close).toHaveFocus();
  });

  it("deduplicates citations and leaves missing or other-client IDs unavailable", async () => {
    vi.mocked(api.analyseCampaignGapAutomatically).mockResolvedValue({
      ...gap, analysis: { ...gap.analysis, supporting_insight_ids: [12, 12, 77, 99, 99] },
    });
    const user = userEvent.setup();
    renderPlan([
      { ...insight, client_id: 2, title: "Wrong client with matching ID" },
      insight,
      { ...insight, id: 77, client_id: 2, title: "Other client" },
      { ...insight, id: 33, title: "Unreferenced insight" },
    ]);
    await generate(user);
    const card = within(screen.getByRole("article", { name: "Customer-Message Gap" }));
    expect(card.getAllByRole("button")).toHaveLength(1);
    expect(card.getByRole("button", { name: /Insight #12: Fast setup matters/ })).toBeInTheDocument();
    expect(card.getByText("Insight #77 — unavailable")).toBeInTheDocument();
    expect(card.getAllByText("Insight #99 — unavailable")).toHaveLength(1);
    expect(card.queryByText(/Wrong client|Other client|Unreferenced insight/)).not.toBeInTheDocument();
  });

  it("opens the existing drawer with metadata, traps focus, and restores focus on close", async () => {
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    const opener = screen.getByRole("button", { name: /View evidence for Insight #12/ });
    await user.click(opener);
    const drawer = within(screen.getByRole("dialog", { name: insight.title }));
    expect(drawer.getByText(signal.text, { exact: false })).toBeInTheDocument();
    expect(drawer.queryByText(insight.evidence[0].excerpt, { exact: false })).not.toBeInTheDocument();
    expect(drawer.getByText("Source: Customer survey")).toBeInTheDocument();
    expect(drawer.getByText("Rating: 5")).toBeInTheDocument();
    expect(drawer.getByText("Product: Starter plan")).toBeInTheDocument();
    expect(api.evidenceQuality).toHaveBeenCalledWith(1, 12, expect.any(AbortSignal));
    expect(api.listSignals).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    const close = drawer.getByRole("button", { name: "Close evidence panel" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Close evidence panel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it.each(["failed", "missing", "other-client"])("falls back to excerpts when signal metadata is %s", async (scenario) => {
    if (scenario === "failed") {
      vi.mocked(api.listSignals).mockRejectedValue(new Error("Metadata unavailable"));
    } else {
      vi.mocked(api.listSignals).mockResolvedValue(scenario === "missing" ? [] : [{ ...signal, client_id: 2 }]);
    }
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    await user.click(screen.getByRole("button", { name: /View evidence for Insight #12/ }));
    if (scenario === "failed") {
      expect(screen.getByRole("status")).toHaveTextContent("Evidence excerpts remain visible.");
    }
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.getByText(insight.evidence[0].excerpt, { exact: false })).toBeInTheDocument();
    expect(drawer.queryByText(/Source:/)).not.toBeInTheDocument();
    expect(drawer.queryByText(signal.text, { exact: false })).not.toBeInTheDocument();
  });

  it("shows the existing caution when a cited insight has no attached evidence", async () => {
    const user = userEvent.setup();
    renderPlan([{ ...insight, evidence: [], evidence_count: 0 }]);
    await generate(user);
    await user.click(screen.getByRole("button", { name: /View evidence for Insight #12/ }));
    expect(within(screen.getByRole("dialog")).getByText(/No supporting evidence is attached/)).toBeInTheDocument();
  });

  it("handles empty analysis lists without inventing citations", async () => {
    vi.mocked(api.analyseCampaignGapAutomatically).mockResolvedValue({
      ...gap,
      analysis: { ...gap.analysis, matched_customer_values: [], message_gaps: [], recommended_actions: [], supporting_insight_ids: [] },
    });
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    const card = within(screen.getByRole("article", { name: "Customer-Message Gap" }));
    expect(card.getAllByText("None identified.")).toHaveLength(3);
    expect(card.getByText("No supporting insights provided.")).toBeInTheDocument();
    expect(card.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the local draft and approval after analysis fails without waiting for metadata", async () => {
    const metadata = deferred<CustomerSignal[]>();
    vi.mocked(api.listSignals).mockReturnValue(metadata.promise);
    const error = new Error("Gateway unavailable");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.analyseCampaignGapAutomatically).mockRejectedValue(error);
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    expect(api.listSignals).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Generate campaign plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Customer-Message Gap" })).not.toBeInTheDocument();
    expect(screen.getByText("Lead with customer-supported value, then remove the strongest barrier to action.")).toBeInTheDocument();
    expect(screen.getByText("Promise, prove, reassure")).toBeInTheDocument();
    expect(errorLog).toHaveBeenCalledWith("Campaign gap analysis failed", error);
    await user.click(screen.getByRole("button", { name: "Approve campaign" }));
    expect(screen.getByText("Campaign approved")).toBeInTheDocument();
    await act(async () => metadata.resolve([signal]));
    expect(screen.getByText("Campaign approved")).toBeInTheDocument();
  });

  it("aborts pending analysis on client changes and ignores late results", async () => {
    const analysis = deferred<CampaignGapResponse>();
    vi.mocked(api.analyseCampaignGapAutomatically).mockReturnValueOnce(analysis.promise);
    const user = userEvent.setup();
    const { rerender } = renderPlan();
    await user.click(screen.getByRole("button", { name: "Generate campaign plan" }));
    const requestSignal = vi.mocked(api.analyseCampaignGapAutomatically).mock.calls[0][2]!;
    expect(requestSignal.aborted).toBe(false);
    rerender(<CampaignPlan clientId={2} brief={brief} insights={[{ ...insight, client_id: 2 }]} onNavigate={vi.fn()} />);
    expect(requestSignal.aborted).toBe(true);
    await act(async () => analysis.resolve(gap));
    expect(screen.queryByRole("article", { name: "Customer-Message Gap" })).not.toBeInTheDocument();
    expect(screen.queryByText("Seven-day evidence-led sequence")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate campaign plan" })).toBeInTheDocument();
  });

  it("closes the drawer and clears old metadata when the client changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPlan();
    await generate(user);
    await user.click(screen.getByRole("button", { name: /View evidence for Insight #12/ }));
    const nextInsight = { ...insight, client_id: 2 };
    rerender(<CampaignPlan clientId={2} brief={brief} insights={[nextInsight]} onNavigate={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    vi.mocked(api.analyseCampaignGapAutomatically).mockResolvedValue({ ...gap, client_id: 2 });
    vi.mocked(api.listSignals).mockResolvedValue([]);
    await generate(user);
    await user.click(screen.getByRole("button", { name: /View evidence for Insight #12/ }));
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.getByText(insight.evidence[0].excerpt, { exact: false })).toBeInTheDocument();
    expect(drawer.queryByText(signal.text, { exact: false })).not.toBeInTheDocument();
  });

  it("aborts pending analysis on unmount", async () => {
    const analysis = deferred<CampaignGapResponse>();
    vi.mocked(api.analyseCampaignGapAutomatically).mockReturnValueOnce(analysis.promise);
    const user = userEvent.setup();
    const { unmount } = renderPlan();
    await user.click(screen.getByRole("button", { name: "Generate campaign plan" }));
    const requestSignal = vi.mocked(api.analyseCampaignGapAutomatically).mock.calls[0][2]!;
    unmount();
    expect(requestSignal.aborted).toBe(true);
    await act(async () => analysis.resolve(gap));
  });

  it("aborts metadata on drawer close and ignores late results after reopening", async () => {
    const staleMetadata = deferred<CustomerSignal[]>();
    const currentMetadata = deferred<CustomerSignal[]>();
    vi.mocked(api.listSignals)
      .mockReturnValueOnce(staleMetadata.promise)
      .mockReturnValueOnce(currentMetadata.promise);
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    const opener = screen.getByRole("button", { name: /View evidence for Insight #12/ });
    await user.click(opener);
    const requestSignal = vi.mocked(api.listSignals).mock.calls[0][1]!;
    await user.click(screen.getByRole("button", { name: "Close evidence panel" }));
    expect(requestSignal.aborted).toBe(true);
    await user.click(opener);
    await act(async () => staleMetadata.resolve([signal]));
    const drawer = within(screen.getByRole("dialog"));
    expect(drawer.getByText(insight.evidence[0].excerpt, { exact: false })).toBeInTheDocument();
    expect(drawer.queryByText(signal.text, { exact: false })).not.toBeInTheDocument();
    await act(async () => currentMetadata.resolve([]));
    expect(drawer.getByText(insight.evidence[0].excerpt, { exact: false })).toBeInTheDocument();
  });

  it.each(["client change", "unmount"])("aborts pending metadata on %s", async (change) => {
    const metadata = deferred<CustomerSignal[]>();
    vi.mocked(api.listSignals).mockReturnValueOnce(metadata.promise);
    const user = userEvent.setup();
    const { rerender, unmount } = renderPlan();
    await generate(user);
    await user.click(screen.getByRole("button", { name: /View evidence for Insight #12/ }));
    const requestSignal = vi.mocked(api.listSignals).mock.calls[0][1]!;
    if (change === "client change") {
      rerender(<CampaignPlan clientId={2} brief={brief} insights={[{ ...insight, client_id: 2 }]} onNavigate={vi.fn()} />);
    } else {
      unmount();
    }
    expect(requestSignal.aborted).toBe(true);
    await act(async () => metadata.resolve([signal]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(signal.text, { exact: false })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
