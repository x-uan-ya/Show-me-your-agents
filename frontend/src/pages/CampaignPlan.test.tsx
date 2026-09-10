import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Insight } from "../types";
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

describe("CampaignPlan", () => {
  it("requires evidence before generating a plan", () => {
    const onNavigate = vi.fn();
    render(
      <CampaignPlan
        clientId={1}
        brief={{
          objective: "Increase sign-ups",
          target_audience: "SME owners",
          channels: ["LinkedIn"],
          current_message: "Work smarter",
        }}
        insights={[]}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("Customer evidence is required")).toBeInTheDocument();
  });

  it("generates a reviewable evidence-linked calendar", async () => {
    const user = userEvent.setup();
    render(
      <CampaignPlan
        clientId={1}
        brief={{
          objective: "Increase sign-ups",
          target_audience: "SME owners",
          channels: ["LinkedIn", "Email"],
          current_message: "Work smarter",
        }}
        insights={[insight]}
        onNavigate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate frontend draft" }));
    expect(screen.getByText("Seven-day evidence-led sequence")).toBeInTheDocument();
    expect(screen.getAllByText("Insight #12").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve campaign" })).toBeInTheDocument();
  });
});
