import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type {
  CampaignCreateInput,
  CampaignGapResponse,
  CustomerSignal,
  Insight,
  MarketingBrief,
  PersistedCampaign,
} from "../types";
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

function persistedCampaign(
  payload: CampaignCreateInput = {
    marketing_brief_id: 41,
    analysis_run_id: insight.analysis_run_id,
    primary_insight_id: insight.id,
    supporting_insight_ids: [insight.id],
    name: "Bright Path · Fast setup matters",
    key_message: "Fast setup matters. Customers value a short setup flow.",
    message_gap: gap.analysis.message_gaps[0],
    cta: "Sign up today",
    kpi: "Qualified campaign sign-ups",
    strategy_payload: {},
    content_items: [
      {
        channel: "LinkedIn",
        content: "Customer proof: Fast setup matters",
        content_type: "Awareness",
        sequence_day: 1,
      },
    ],
  },
): PersistedCampaign {
  return {
    id: 501,
    client_id: 1,
    marketing_brief_id: payload.marketing_brief_id,
    analysis_run_id: payload.analysis_run_id ?? null,
    primary_insight_id: payload.primary_insight_id ?? null,
    supporting_insight_ids: payload.supporting_insight_ids,
    primary_insight: {
      id: payload.primary_insight_id ?? insight.id,
      analysis_run_id: payload.analysis_run_id ?? insight.analysis_run_id,
      title: insight.title,
      summary: insight.summary,
      confidence: insight.confidence,
      evidence_count: insight.evidence_count,
    },
    name: payload.name,
    objective: brief.objective,
    target_audience: brief.target_audience,
    key_message: payload.key_message,
    message_gap: payload.message_gap ?? null,
    cta: payload.cta,
    kpi: payload.kpi,
    status: payload.status ?? "draft",
    start_date: payload.start_date ?? null,
    end_date: payload.end_date ?? null,
    strategy_payload: payload.strategy_payload,
    content_items: payload.content_items.map((item, index) => ({
      ...item,
      id: 700 + index,
      campaign_id: 501,
      content_type: item.content_type ?? null,
      cta: item.cta ?? null,
      sequence_day: item.sequence_day ?? null,
      publish_date: item.publish_date ?? null,
      owner: item.owner ?? null,
      status: item.status ?? "draft",
      created_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    })),
    approval: {
      id: 901,
      campaign_id: 501,
      status: "pending",
      reviewer: null,
      revision_comment: null,
      decided_at: null,
      created_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
  };
}

function renderPlan(insights: Insight[] = [insight]) {
  return render(
    <CampaignPlan
      clientId={1}
      clientName="Bright Path"
      brief={brief}
      insights={insights}
      onNavigate={vi.fn()}
    />,
  );
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Generate campaign plan" }));
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
    vi.spyOn(api, "listCampaigns").mockResolvedValue([]);
    vi.spyOn(api, "saveMarketingBrief").mockResolvedValue({
      id: 41,
      client_id: 1,
      ...brief,
      created_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    });
    vi.spyOn(api, "generateCampaign").mockImplementation(
      async (clientId) => ({
        campaign: { ...persistedCampaign(), client_id: clientId },
        gap: { ...gap, client_id: clientId },
      }),
    );
    vi.spyOn(api, "createCampaign").mockImplementation(
      async (_clientId, payload) => persistedCampaign(payload),
    );
    vi.spyOn(api, "updateCampaignStatus").mockImplementation(
      async (_clientId, _campaignId, payload) => ({
        ...persistedCampaign(),
        status: payload.status,
        approval: {
          ...persistedCampaign().approval!,
          status: payload.status === "draft" ? "pending" : payload.status,
        },
      }),
    );
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

  it("requires a client before campaign generation is available", () => {
    render(
      <CampaignPlan
        clientId={null}
        brief={brief}
        insights={[insight]}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText("Choose an SME client first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate campaign plan" })).not.toBeInTheDocument();
    expect(api.analyseCampaignGapAutomatically).not.toHaveBeenCalled();
  });

  it("recognises a selected client with a complete brief and usable insights", async () => {
    renderPlan();
    expect(screen.queryByText("Choose an SME client first")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Generate campaign plan" })).toBeInTheDocument();
  });

  it("requires evidence before generating a plan", async () => {
    renderPlan([]);
    expect(await screen.findByText("Customer evidence is required")).toBeInTheDocument();
  });

  it("requires evidence belonging to the active client", async () => {
    renderPlan([{ ...insight, client_id: 2 }]);
    expect(await screen.findByText("Customer evidence is required")).toBeInTheDocument();
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
    expect(api.updateCampaignStatus).toHaveBeenCalledWith(
      1,
      501,
      { status: "approved" },
    );
  });

  it("persists the brief, campaign, evidence links, and generated content items", async () => {
    const user = userEvent.setup();
    renderPlan();
    await generate(user);

    expect(api.saveMarketingBrief).toHaveBeenCalledWith(1, brief, expect.any(AbortSignal));
    expect(api.generateCampaign).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        marketing_brief_id: 41,
        analysis_run_id: insight.analysis_run_id,
        primary_insight_id: insight.id,
        supporting_insight_ids: [insight.id],
        gap,
      }),
      expect.any(AbortSignal),
    );
    expect(screen.getByText(/Saved to backend as Campaign #501/)).toBeInTheDocument();
  });

  it("retrieves a saved campaign and content items after in-memory insights are gone", async () => {
    vi.mocked(api.listCampaigns).mockResolvedValueOnce([persistedCampaign()]);
    renderPlan([]);

    const stored = within(await screen.findByRole("article", { name: "Saved campaign #501" }));
    expect(stored.getByText("Retrieved from campaign database")).toBeInTheDocument();
    expect(stored.getByText("Campaign #501 · draft")).toBeInTheDocument();
    expect(stored.getByText("Customer proof: Fast setup matters")).toBeInTheDocument();
    expect(screen.queryByText("Customer evidence is required")).not.toBeInTheDocument();
    expect(api.createCampaign).not.toHaveBeenCalled();
  });

  it("shows generation progress while live analysis is pending", async () => {
    const analysis = deferred<CampaignGapResponse>();
    vi.mocked(api.analyseCampaignGapAutomatically).mockReturnValueOnce(analysis.promise);
    const user = userEvent.setup();
    renderPlan();

    await user.click(await screen.findByRole("button", { name: "Generate campaign plan" }));
    expect(screen.getByRole("status")).toHaveTextContent("Generating campaign plan");
    expect(screen.queryByRole("button", { name: "Generate campaign plan" })).not.toBeInTheDocument();

    await act(async () => analysis.resolve(gap));
    expect(screen.getByRole("article", { name: "Customer-Message Gap" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("builds a complete execution brief for the selected client", async () => {
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    const execution = within(screen.getByRole("article", { name: "Campaign execution brief" }));

    expect(execution.getByRole("heading", { name: "Bright Path · Fast setup matters" })).toBeInTheDocument();
    for (const field of [
      "Campaign name",
      "Objective",
      "Target audience",
      "Key customer insight",
      "Customer–Message Gap",
      "Recommended key message",
      "Channels",
      "Content / activation ideas",
      "Call to action (CTA)",
      "KPI / success metric",
    ]) {
      expect(execution.getByText(field)).toBeInTheDocument();
    }
    expect(execution.getByText("Sign up today")).toBeInTheDocument();
    expect(execution.getByText("Qualified campaign sign-ups")).toBeInTheDocument();
  });

  it("renders the backend-generated campaign returned after insight selection", async () => {
    const strongerInsight: Insight = {
      ...insight,
      id: 13,
      title: "Trusted automation wins",
      summary: "Customers adopt automation when the outcome is transparent.",
      confidence: 0.95,
      evidence_count: 3,
      evidence: [
        { signal_id: 22, excerpt: "I need to understand every automated action.", relevance_score: 0.96 },
      ],
    };
    const user = userEvent.setup();
    renderPlan([insight, strongerInsight]);

    expect(await screen.findByText((_, element) =>
      element?.tagName === "P" &&
      element.textContent?.includes("Strongest planning anchor: Trusted automation wins") === true,
    )).toBeInTheDocument();
    await generate(user);
    const execution = within(screen.getByRole("article", { name: "Campaign execution brief" }));
    expect(execution.getByRole("heading", { name: "Bright Path · Fast setup matters" })).toBeInTheDocument();
    expect(execution.getByText(strongerInsight.summary)).toBeInTheDocument();
  });

  it("passes gap-analysis values to the backend campaign generator", async () => {
    vi.mocked(api.analyseCampaignGapAutomatically).mockResolvedValue({
      ...gap,
      analysis: { ...gap.analysis, matched_customer_values: ["Reliable onboarding"] },
    });
    const user = userEvent.setup();
    renderPlan();
    await generate(user);
    expect(api.generateCampaign).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        gap: expect.objectContaining({
          analysis: expect.objectContaining({
            matched_customer_values: ["Reliable onboarding"],
          }),
        }),
      }),
      expect.any(AbortSignal),
    );
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Live Customer-Message Gap analysis could not be completed",
    );
    expect(screen.getByRole("button", { name: "Retry live analysis" })).toBeInTheDocument();
    expect(screen.getByText("Lead with customer-supported value, then remove the strongest barrier to action.")).toBeInTheDocument();
    expect(screen.getByText("Promise, prove, reassure")).toBeInTheDocument();
    expect(errorLog).toHaveBeenCalledWith("Campaign gap analysis failed", error);
    await user.click(screen.getByRole("button", { name: "Approve campaign" }));
    expect(screen.getByText("Campaign approved")).toBeInTheDocument();
    await act(async () => metadata.resolve([signal]));
    expect(screen.getByText("Campaign approved")).toBeInTheDocument();
  });

  it("keeps the generated draft visible and reports when backend saving fails", async () => {
    const error = new Error("Database unavailable");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.generateCampaign).mockRejectedValue(error);
    const user = userEvent.setup();
    renderPlan();

    await generate(user);

    expect(screen.getByRole("article", { name: "Customer-Message Gap" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The backend could not generate and save the campaign.",
    );
    expect(screen.queryByText(/Saved to backend as Campaign/)).not.toBeInTheDocument();
    expect(errorLog).toHaveBeenCalledWith("Backend campaign generation failed", error);
  });

  it("aborts pending analysis on client changes and ignores late results", async () => {
    const analysis = deferred<CampaignGapResponse>();
    vi.mocked(api.analyseCampaignGapAutomatically).mockReturnValueOnce(analysis.promise);
    const user = userEvent.setup();
    const { rerender } = renderPlan();
    await user.click(await screen.findByRole("button", { name: "Generate campaign plan" }));
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
    await user.click(await screen.findByRole("button", { name: "Generate campaign plan" }));
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
