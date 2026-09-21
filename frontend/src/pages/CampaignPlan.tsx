import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { api, isAbortError } from "../api/client";
import { CustomerMessageGapCard } from "../components/CustomerMessageGapCard";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import {
  type AppView,
  type CampaignGapResponse,
  type CustomerSignal,
  type Insight,
  type MarketingBrief,
  type PersistedCampaign,
} from "../types";

interface Props {
  clientId: number | null;
  clientName?: string;
  brief: MarketingBrief;
  insights: Insight[];
  onNavigate: (view: AppView) => void;
}

type ApprovalState = "draft" | "approved" | "rejected";
type GenerationStatus = "idle" | "generating" | "success" | "error";

interface CalendarItem {
  day: string;
  channel: string;
  content: string;
  purpose: string;
  evidence: Insight | null;
}

interface CampaignExecutionDraft {
  name: string;
  objective: string;
  targetAudience: string;
  keyInsight: Insight;
  messageGap: string;
  recommendedMessage: string;
  channels: string[];
  contentIdeas: string[];
  cta: string;
  kpi: string;
}

function highestRelevance(insight: Insight): number {
  return insight.evidence.reduce(
    (highest, item) => Math.max(highest, item.relevance_score ?? 0),
    0,
  );
}

/**
 * Prefer evidence-backed insights, then follow the backend's confidence-first
 * ordering. The remaining evidence metadata provides deterministic tie-breaks
 * without relying on provider response order or an opaque composite score.
 */
function rankInsights(insights: Insight[]): Insight[] {
  return [...insights].sort(
    (left, right) =>
      Number(right.evidence_count > 0) - Number(left.evidence_count > 0) ||
      right.confidence - left.confidence ||
      right.evidence_count - left.evidence_count ||
      highestRelevance(right) - highestRelevance(left) ||
      left.id - right.id,
  );
}

function campaignCta(objective: string): string {
  const normalised = objective.toLowerCase();
  if (normalised.includes("sign-up") || normalised.includes("signup")) {
    return "Sign up today";
  }
  if (normalised.includes("trial") || normalised.includes("try")) {
    return "Try it today";
  }
  if (normalised.includes("order") || normalised.includes("sales")) {
    return "Order now";
  }
  if (normalised.includes("traffic") || normalised.includes("visit")) {
    return "Plan your visit";
  }
  if (normalised.includes("retention") || normalised.includes("repeat")) {
    return "Come back and experience it again";
  }
  return "Take the next step";
}

function campaignKpi(objective: string): string {
  const normalised = objective.toLowerCase();
  if (normalised.includes("sign-up") || normalised.includes("signup")) {
    return "Qualified campaign sign-ups";
  }
  if (normalised.includes("trial") || normalised.includes("try")) {
    return "First-time trials attributed to the campaign";
  }
  if (normalised.includes("traffic") || normalised.includes("visit")) {
    return "Campaign-attributed visits during the target period";
  }
  if (normalised.includes("retention") || normalised.includes("repeat")) {
    return "Repeat engagement or repeat-purchase rate";
  }
  if (normalised.includes("sales") || normalised.includes("revenue")) {
    return "Campaign-attributed conversions and revenue";
  }
  return `Primary conversions tied to “${objective}”`;
}

function buildExecutionDraft({
  clientId,
  clientName,
  brief,
  keyInsight,
  gapResult,
}: {
  clientId: number;
  clientName: string;
  brief: MarketingBrief;
  keyInsight: Insight;
  gapResult: CampaignGapResponse | null;
}): CampaignExecutionDraft {
  const currentMessage = brief.current_message.trim();
  const matchedValue = gapResult?.analysis.matched_customer_values[0];
  const messageGap =
    gapResult?.analysis.message_gaps[0] ??
    (currentMessage
      ? `Connect “${currentMessage}” more directly to the evidence-backed customer need “${keyInsight.title}”.`
      : `No current message is recorded; establish “${keyInsight.title}” as the campaign's customer-led message foundation.`);
  const recommendedMessage = matchedValue
    ? `${matchedValue}. ${keyInsight.summary}`
    : `${keyInsight.title}. ${keyInsight.summary}`;
  const channels = brief.channels.length > 0 ? brief.channels : ["Primary channel"];
  const cta = campaignCta(brief.objective);
  const suggestedIdeas = gapResult?.analysis.recommended_actions ?? [];
  const contentIdeas = suggestedIdeas.length > 0
    ? suggestedIdeas
    : [
        `${channels[0]} customer-proof story using “${keyInsight.evidence[0]?.excerpt ?? keyInsight.title}”.`,
        `${channels[1 % channels.length]} message-gap creative that introduces “${recommendedMessage}”.`,
        `${channels[2 % channels.length]} conversion post that closes with “${cta}”.`,
      ];

  return {
    name: `${clientName.trim() || `Client #${clientId}`} · ${keyInsight.title}`,
    objective: brief.objective,
    targetAudience: brief.target_audience,
    keyInsight,
    messageGap,
    recommendedMessage,
    channels,
    contentIdeas,
    cta,
    kpi: campaignKpi(brief.objective),
  };
}

function buildCalendar(
  brief: MarketingBrief,
  driver: Insight | null,
  concern: Insight | null,
  gapResult: CampaignGapResponse | null,
): CalendarItem[] {
  const channels = brief.channels.length > 0 ? brief.channels : ["Primary channel"];
  const matchedValue = gapResult?.analysis.matched_customer_values[0];
  const messageGap = gapResult?.analysis.message_gaps[0];
  const recommendedAction = gapResult?.analysis.recommended_actions[0];
  return [
    {
      day: "Day 1",
      channel: channels[0],
      content: matchedValue
        ? `Customer proof: ${matchedValue}`
        : driver
        ? `Customer proof: ${driver.title}`
        : "Lead with the strongest customer-supported value",
      purpose: "Awareness",
      evidence: driver,
    },
    {
      day: "Day 3",
      channel: channels[1 % channels.length],
      content: messageGap
        ? `Address the concern: ${messageGap}`
        : concern
        ? `Address the concern: ${concern.title}`
        : "Answer the most important customer concern",
      purpose: "Trust",
      evidence: concern,
    },
    {
      day: "Day 5",
      channel: channels[2 % channels.length],
      content: recommendedAction ?? "Show the offer in use with a clear next step",
      purpose: "Consideration",
      evidence: driver,
    },
    {
      day: "Day 7",
      channel: channels[0],
      content: "Invite feedback and capture the next customer signal",
      purpose: "Learning loop",
      evidence: concern ?? driver,
    },
  ];
}

function pickInsight(insights: Insight[], categories: string[]): Insight | null {
  return (
    insights.find((insight) => categories.includes(insight.category)) ??
    insights[0] ??
    null
  );
}

export function CampaignPlan({ clientId, clientName = "", brief, insights, onNavigate }: Props) {
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [gapResult, setGapResult] = useState<CampaignGapResponse | null>(null);
  const [persistedCampaign, setPersistedCampaign] = useState<PersistedCampaign | null>(null);
  const [approval, setApproval] = useState<ApprovalState>("draft");
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [signalsById, setSignalsById] = useState<Map<number, CustomerSignal>>(new Map());
  const [evidenceWarning, setEvidenceWarning] = useState<string | null>(null);
  const analysisController = useRef<AbortController | null>(null);
  const campaignListController = useRef<AbortController | null>(null);
  const closeEvidence = useCallback(() => setSelectedInsight(null), []);
  const activeInsights = useMemo(
    () => rankInsights(insights.filter((insight) => insight.client_id === clientId)),
    [clientId, insights],
  );

  const briefReady = Boolean(
    brief.objective.trim() &&
      brief.target_audience.trim() &&
      brief.channels.length > 0,
  );
  const evidenceReady = activeInsights.length > 0;
  const generated = generationStatus === "success" || generationStatus === "error";
  const showingPersistedOnly = Boolean(
    persistedCampaign && generationStatus === "idle" && (!briefReady || !evidenceReady),
  );
  const keyInsight = activeInsights[0] ?? null;
  const executionDraft = useMemo(
    () =>
      clientId !== null && keyInsight
        ? buildExecutionDraft({ clientId, clientName, brief, keyInsight, gapResult })
        : null,
    [brief, clientId, clientName, gapResult, keyInsight],
  );

  useEffect(() => {
    setGenerationStatus("idle");
    setGenerationError(null);
    setGapResult(null);
    setApproval("draft");
    setApprovalError(null);
    setSelectedInsight(null);
    setSignalsById(new Map());
    setEvidenceWarning(null);
    return () => analysisController.current?.abort();
  }, [clientId, brief, insights]);

  useEffect(() => {
    setPersistedCampaign(null);
    if (clientId === null) return;
    const controller = new AbortController();
    campaignListController.current?.abort();
    campaignListController.current = controller;
    api.listCampaigns(clientId, controller.signal)
      .then((campaigns) => {
        if (!controller.signal.aborted) {
          setPersistedCampaign(
            campaigns.find((campaign) => campaign.client_id === clientId) ?? null,
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          console.error("Saved campaigns could not be loaded", error);
        }
      })
      .finally(() => {
        if (campaignListController.current === controller) {
          campaignListController.current = null;
        }
      });
    return () => {
      controller.abort();
      if (campaignListController.current === controller) {
        campaignListController.current = null;
      }
    };
  }, [clientId]);

  useEffect(() => {
    setSignalsById(new Map());
    setEvidenceWarning(null);
    if (clientId === null || !selectedInsight || selectedInsight.client_id !== clientId) return;

    const controller = new AbortController();
    api.listSignals(clientId, controller.signal)
      .then((signals) => {
        if (controller.signal.aborted) return;
        setSignalsById(new Map(
          signals
            .filter((signal) => signal.client_id === clientId)
            .map((signal) => [signal.id, signal]),
        ));
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setEvidenceWarning(
          "Insights are available, but source metadata could not be loaded. Evidence excerpts remain visible.",
        );
      });
    return () => controller.abort();
  }, [clientId, selectedInsight]);

  const generateCampaign = async () => {
    if (clientId === null || generationStatus === "generating") return;
    const controller = new AbortController();
    campaignListController.current?.abort();
    campaignListController.current = null;
    analysisController.current?.abort();
    analysisController.current = controller;
    setGenerationStatus("generating");
    setGenerationError(null);
    setGapResult(null);
    setPersistedCampaign(null);
    setApproval("draft");
    setSignalsById(new Map());
    setEvidenceWarning(null);
    setSelectedInsight(null);
    let response: CampaignGapResponse;
    try {
      response = await api.analyseCampaignGapAutomatically(
        clientId,
        {
          objective: brief.objective,
          target_audience: brief.target_audience,
          active_message: brief.current_message,
          channels: brief.channels,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (response.client_id !== clientId) {
        throw new Error("Campaign gap analysis belongs to a different client");
      }
      setGapResult(response);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      // Preserve the evidence-based local draft when analysis is unavailable.
      console.error("Campaign gap analysis failed", error);
      setGenerationError(
        "Live Customer-Message Gap analysis could not be completed. The evidence-based local campaign draft is shown below.",
      );
      setGenerationStatus("error");
      if (analysisController.current === controller) {
        analysisController.current = null;
      }
      return;
    }

    try {
      if (!keyInsight) throw new Error("No usable customer insight is available");
      const draft = buildExecutionDraft({
        clientId,
        clientName,
        brief,
        keyInsight,
        gapResult: response,
      });
      const generatedCalendar = buildCalendar(brief, driver, concern, response);
      const persistedBrief = await api.saveMarketingBrief(
        clientId,
        brief,
        controller.signal,
      );
      const activeInsightIds = new Set(activeInsights.map((insight) => insight.id));
      const supportingInsightIds = Array.from(new Set([
        keyInsight.id,
        ...response.analysis.supporting_insight_ids.filter((id) => activeInsightIds.has(id)),
      ]));
      const savedCampaign = await api.createCampaign(
        clientId,
        {
          marketing_brief_id: persistedBrief.id,
          analysis_run_id: keyInsight.analysis_run_id,
          primary_insight_id: keyInsight.id,
          supporting_insight_ids: supportingInsightIds,
          name: draft.name,
          key_message: draft.recommendedMessage,
          message_gap: draft.messageGap,
          cta: draft.cta,
          kpi: draft.kpi,
          status: "draft",
          strategy_payload: {
            current_message: brief.current_message,
            gap_analysis: response.analysis,
          },
          content_items: generatedCalendar.map((item) => ({
            channel: item.channel,
            content: item.content,
            content_type: item.purpose,
            cta: item.purpose === "Consideration" ? draft.cta : null,
            sequence_day: Number(item.day.replace("Day ", "")),
            publish_date: null,
            status: "draft",
          })),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (savedCampaign.client_id !== clientId) {
        throw new Error("Persisted campaign belongs to a different client");
      }
      setPersistedCampaign(savedCampaign);
      setGenerationStatus("success");
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      console.error("Campaign persistence failed", error);
      setGenerationError(
        "The campaign was generated, but it could not be saved to the backend. Retry to create a durable campaign record.",
      );
      setGenerationStatus("error");
    } finally {
      if (analysisController.current === controller) {
        analysisController.current = null;
      }
    }
  };

  const driver = useMemo(
    () =>
      pickInsight(activeInsights, [
        "PURCHASE_DRIVER",
        "RETENTION_DRIVER",
        "TRIAL_DRIVER",
      ]),
    [activeInsights],
  );
  const concern = useMemo(
    () =>
      pickInsight(activeInsights, [
        "PAIN_POINT",
        "CUSTOMER_ANXIETY",
        "NON_REPEAT_DRIVER",
        "UNMET_NEED",
      ]),
    [activeInsights],
  );

  const calendar = useMemo<CalendarItem[]>(() => {
    return buildCalendar(brief, driver, concern, gapResult);
  }, [brief.channels, concern, driver, gapResult]);

  const displayedCalendar = useMemo<CalendarItem[]>(() => {
    if (!persistedCampaign || generationStatus === "idle") return calendar;
    return persistedCampaign.content_items.map((item, index) => {
      const sequenceDay = item.sequence_day ?? index + 1;
      const localItem = calendar.find((candidate) => candidate.day === `Day ${sequenceDay}`);
      return {
        day: `Day ${sequenceDay}`,
        channel: item.channel,
        content: item.content,
        purpose: item.content_type ?? "Campaign content",
        evidence: localItem?.evidence ?? null,
      };
    });
  }, [calendar, generationStatus, persistedCampaign]);

  const updateApproval = async (next: ApprovalState) => {
    const previous = approval;
    setApproval(next);
    setApprovalError(null);
    if (clientId === null || !persistedCampaign) return;
    try {
      const updated = await api.updateCampaignStatus(
        clientId,
        persistedCampaign.id,
        { status: next === "rejected" ? "revision_requested" : next },
      );
      setPersistedCampaign(updated);
    } catch (error) {
      if (!isAbortError(error)) {
        setApproval(previous);
        setApprovalError("Approval could not be saved. The campaign remains available for review.");
      }
    }
  };

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Evidence → insight → strategy → campaign</p>
            <h1>Campaign plan</h1>
            <p>
              Convert validated customer insight into a reviewable campaign
              direction, content calendar and publishing schedule.
            </p>
          </div>
          <div className="step-rail" aria-label="Customer journey progress">
            <span>1</span><i /><span>2</span><i /><span className="is-active">3</span>
          </div>
        </header>

        {clientId === null && (
          <EmptyStep
            title="Choose an SME client first"
            copy="Create or select the client whose campaign you want to plan."
            action="Set up client and data"
            onClick={() => onNavigate("import")}
          />
        )}

        {showingPersistedOnly && persistedCampaign && (
          <PersistedCampaignSummary campaign={persistedCampaign} />
        )}

        {clientId !== null && !showingPersistedOnly && !briefReady && (
          <EmptyStep
            title="Complete the campaign brief"
            copy="Add a business objective, target audience and at least one marketing channel."
            action="Complete client brief"
            onClick={() => onNavigate("import")}
          />
        )}

        {clientId !== null && !showingPersistedOnly && briefReady && !evidenceReady && (
          <EmptyStep
            title="Customer evidence is required"
            copy="Analyse customer feedback before generating campaign direction."
            action="Open customer insights"
            onClick={() => onNavigate("insights")}
          />
        )}

        {clientId !== null && briefReady && evidenceReady && generationStatus === "idle" && (
          <section className="campaign-gate">
            <div className="campaign-gate-copy">
              <p className="section-kicker">Inputs ready</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Build a campaign draft from {activeInsights.length} insight
                {activeInsights.length === 1 ? "" : "s"}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Objective: {brief.objective}. Audience: {brief.target_audience}.
                Channels: {brief.channels.join(", ")}.
              </p>
              {keyInsight && (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-200">
                  Strongest planning anchor: <strong>{keyInsight.title}</strong>
                  {keyInsight.evidence_count > 0
                    ? ` · ${keyInsight.evidence_count} evidence item${keyInsight.evidence_count === 1 ? "" : "s"}`
                    : " · evidence attachment pending"}
                </p>
              )}
              <button
                type="button"
                onClick={() => void generateCampaign()}
                className="primary-button mt-6"
              >
                Generate campaign plan
              </button>
              <div className="empty-step-features campaign-gate-features">
                <span>↗</span><p><strong>Evidence-linked</strong><small>Grounded in validated customer insights</small></p>
                <span>▣</span><p><strong>End-to-end planning</strong><small>From strategy to content calendar</small></p>
                <span>♧</span><p><strong>Built for SMEs</strong><small>Simple, actionable, and results-focused</small></p>
              </div>
            </div>
            <div className="campaign-gate-visual" aria-hidden="true">
              <img src="/campaign-plan-illustration.png" alt="" />
            </div>
          </section>
        )}

        {clientId !== null && briefReady && evidenceReady && generationStatus === "generating" && (
          <section className="surface-card p-6 sm:p-8" role="status" aria-live="polite">
            <p className="section-kicker">Campaign generation</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Generating campaign plan…
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Comparing the active message with customer evidence and turning the
              strongest supported insight into an execution-ready draft.
            </p>
          </section>
        )}

        {generated && briefReady && evidenceReady && (
          <>
            {persistedCampaign && (
              <section className="rounded-2xl border border-emerald-700/60 bg-emerald-950/35 p-4">
                <p className="text-sm font-semibold text-emerald-200">
                  Saved to backend as Campaign #{persistedCampaign.id}
                  <span className="ml-2 font-normal text-emerald-300/80">
                    · {persistedCampaign.status}
                  </span>
                </p>
              </section>
            )}
            {generationError && (
              <section className="surface-card border-amber-500/40 p-5 sm:p-6" role="alert">
                <p className="section-kicker text-amber-300">Campaign requires attention</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">{generationError}</p>
                <button
                  type="button"
                  onClick={() => void generateCampaign()}
                  className="secondary-button mt-4"
                >
                  Retry live analysis
                </button>
              </section>
            )}
            {gapResult ? (
              <CustomerMessageGapCard
                gap={gapResult}
                insights={activeInsights}
                onViewEvidence={setSelectedInsight}
              />
            ) : (
              <section className="plan-summary-grid">
                <article className="surface-card recommendation-card p-5 sm:p-6 xl:col-span-2">
                  <p className="section-kicker">Campaign recommendation</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Lead with customer-supported value, then remove the strongest barrier to action.
                  </h2>
                  <p className="mt-3 text-base leading-7 text-slate-300">
                    Pursue <strong>{brief.objective}</strong> for {brief.target_audience}.
                    {driver ? ` Anchor the message in “${driver.title}”.` : ""}
                    {concern ? ` Address “${concern.title}” directly.` : ""}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {Array.from(new Set([driver, concern]))
                      .filter((item): item is Insight => item !== null)
                      .map((insight) => (
                        <button
                          key={insight.id}
                          type="button"
                          onClick={() => onNavigate("insights")}
                          className="data-chip hover:border-cyan-500 hover:text-cyan-200"
                        >
                          Evidence #{insight.id} · {insight.confidence_label}
                        </button>
                      ))}
                  </div>
                </article>

                <article className="surface-card strategy-card p-5 sm:p-6">
                  <p className="section-kicker">Messaging strategy</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    Promise, prove, reassure
                  </h2>
                  <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                    {[
                      "State the customer value in plain language.",
                      "Prove it with real customer evidence.",
                      "Resolve the main hesitation before the call to action.",
                    ].map((step, index) => (
                      <li key={step}><strong className="text-cyan-300">{index + 1}.</strong> {step}</li>
                    ))}
                  </ol>
                </article>
              </section>
            )}
            {executionDraft && (
              <CampaignExecutionBrief
                draft={executionDraft}
                persistedCampaign={persistedCampaign}
                onViewEvidence={() => setSelectedInsight(executionDraft.keyInsight)}
              />
            )}
            {evidenceWarning && (
              <p role="status" className="evidence-disclaimer">{evidenceWarning}</p>
            )}

            <section className="surface-card overflow-hidden">
              <div className="border-b border-slate-800 p-5 sm:p-6">
                <p className="section-kicker">Content calendar</p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  Seven-day evidence-led sequence
                </h2>
              </div>
              <div
                className="overflow-x-auto"
                role="region"
                aria-label="Seven-day campaign calendar"
                tabIndex={0}
              >
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">
                    Seven-day evidence-led campaign content schedule
                  </caption>
                  <thead className="bg-slate-950/70 text-slate-400">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Schedule</th>
                      <th scope="col" className="px-5 py-3 font-medium">Channel</th>
                      <th scope="col" className="px-5 py-3 font-medium">Content direction</th>
                      <th scope="col" className="px-5 py-3 font-medium">Purpose</th>
                      <th scope="col" className="px-5 py-3 font-medium">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {displayedCalendar.map((item) => (
                      <tr key={`${item.day}-${item.channel}`} className="text-slate-300">
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-white">
                          {item.day}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">{item.channel}</td>
                        <td className="min-w-72 px-5 py-4">{item.content}</td>
                        <td className="whitespace-nowrap px-5 py-4">{item.purpose}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-cyan-300">
                          {item.evidence ? `Insight #${item.evidence.id}` : "Brief"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`surface-card approval-card is-${approval} p-5 sm:p-6`}>
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                <div>
                  <p className="section-kicker">Human approval</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">
                    {approval === "draft"
                      ? "Review before scheduling"
                      : approval === "approved"
                        ? "Campaign approved"
                        : "Campaign returned for revision"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    {persistedCampaign
                      ? `Approval status is persisted with Campaign #${persistedCampaign.id}.`
                      : "Save the campaign before approval can be persisted."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void updateApproval("rejected")}
                    className="secondary-button"
                  >
                    Request revision
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateApproval("approved")}
                    className="success-button"
                  >
                    Approve campaign
                  </button>
                </div>
              </div>
              {approvalError && (
                <p role="alert" className="mt-4 text-sm text-amber-300">{approvalError}</p>
              )}
            </section>
          </>
        )}
      </div>
      {selectedInsight && selectedInsight.client_id === clientId && (
        <EvidenceDrawer
          insight={selectedInsight}
          signalsById={signalsById}
          onClose={closeEvidence}
        />
      )}
    </main>
  );
}

function CampaignExecutionBrief({
  draft,
  persistedCampaign,
  onViewEvidence,
}: {
  draft: CampaignExecutionDraft;
  persistedCampaign: PersistedCampaign | null;
  onViewEvidence: () => void;
}) {
  const name = persistedCampaign?.name ?? draft.name;
  const objective = persistedCampaign?.objective ?? draft.objective;
  const targetAudience = persistedCampaign?.target_audience ?? draft.targetAudience;
  const messageGap = persistedCampaign?.message_gap ?? draft.messageGap;
  const recommendedMessage = persistedCampaign?.key_message ?? draft.recommendedMessage;
  const cta = persistedCampaign?.cta ?? draft.cta;
  const kpi = persistedCampaign?.kpi ?? draft.kpi;
  return (
    <article className="surface-card p-5 sm:p-6" aria-label="Campaign execution brief">
      <p className="section-kicker">Execution-ready campaign brief</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{name}</h2>
      <dl className="mt-6 grid gap-5 md:grid-cols-2">
        <PlanField label="Campaign name"><p>{name}</p></PlanField>
        <PlanField label="Objective"><p>{objective}</p></PlanField>
        <PlanField label="Target audience"><p>{targetAudience}</p></PlanField>
        <PlanField label="Key customer insight">
          <p>{draft.keyInsight.title}</p>
          <p className="mt-1 text-sm text-slate-400">{draft.keyInsight.summary}</p>
          <button
            type="button"
            onClick={onViewEvidence}
            className="mt-3 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
            aria-label={`View evidence for primary insight #${draft.keyInsight.id}`}
          >
            View supporting evidence →
          </button>
        </PlanField>
        <PlanField label="Customer–Message Gap"><p>{messageGap}</p></PlanField>
        <PlanField label="Recommended key message"><p>{recommendedMessage}</p></PlanField>
        <PlanField label="Channels"><p>{draft.channels.join(", ")}</p></PlanField>
        <PlanField label="Content / activation ideas">
          <ul className="list-disc space-y-2 pl-5">
            {draft.contentIdeas.map((idea) => <li key={idea}>{idea}</li>)}
          </ul>
        </PlanField>
        <PlanField label="Call to action (CTA)"><p>{cta}</p></PlanField>
        <PlanField label="KPI / success metric"><p>{kpi}</p></PlanField>
      </dl>
    </article>
  );
}

function PersistedCampaignSummary({ campaign }: { campaign: PersistedCampaign }) {
  return (
    <article className="surface-card overflow-hidden" aria-label={`Saved campaign #${campaign.id}`}>
      <div className="border-b border-slate-800 p-5 sm:p-6">
        <p className="section-kicker">Retrieved from campaign database</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-white">{campaign.name}</h2>
          <span className="context-pill">Campaign #{campaign.id} · {campaign.status}</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {campaign.objective} · {campaign.target_audience}
        </p>
      </div>
      <dl className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        {campaign.primary_insight && (
          <PlanField label="Key customer insight">
            <p>{campaign.primary_insight.title}</p>
            <p className="mt-1 text-sm text-slate-400">{campaign.primary_insight.summary}</p>
          </PlanField>
        )}
        <PlanField label="Customer–Message Gap">
          <p>{campaign.message_gap ?? "No message gap was saved."}</p>
        </PlanField>
        <PlanField label="Recommended key message"><p>{campaign.key_message}</p></PlanField>
        <PlanField label="Call to action (CTA)"><p>{campaign.cta}</p></PlanField>
        <PlanField label="KPI / success metric"><p>{campaign.kpi}</p></PlanField>
        <PlanField label="Approval">
          <p>{campaign.approval?.status ?? "pending"}</p>
        </PlanField>
      </dl>
      <div className="overflow-x-auto border-t border-slate-800">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Persisted campaign content items</caption>
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Sequence</th>
              <th scope="col" className="px-5 py-3 font-medium">Channel</th>
              <th scope="col" className="px-5 py-3 font-medium">Content</th>
              <th scope="col" className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {campaign.content_items.map((item, index) => (
              <tr key={item.id} className="text-slate-300">
                <td className="px-5 py-4">Day {item.sequence_day ?? index + 1}</td>
                <td className="px-5 py-4">{item.channel}</td>
                <td className="min-w-72 px-5 py-4">{item.content}</td>
                <td className="px-5 py-4">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function PlanField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-slate-200">{children}</dd>
    </div>
  );
}

function EmptyStep({
  title,
  copy,
  action,
  onClick,
}: {
  title: string;
  copy: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <section className="surface-card empty-step-card">
      <div className="empty-step-copy">
        <p className="section-kicker">Get started</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-3 max-w-xl text-base leading-7 text-slate-300">{copy}</p>
        <button type="button" onClick={onClick} className="primary-button mt-6">{action}</button>
        <div className="empty-step-features">
          <span>↗</span><p><strong>Evidence-linked</strong><small>Grounded in validated customer insights</small></p>
          <span>▣</span><p><strong>End-to-end planning</strong><small>From strategy to content calendar</small></p>
          <span>♧</span><p><strong>Built for SMEs</strong><small>Simple, actionable, and results-focused</small></p>
        </div>
      </div>
      <div className="empty-step-visual" aria-hidden="true">
        <img src="/campaign-plan-illustration.png" alt="" />
      </div>
    </section>
  );
}
