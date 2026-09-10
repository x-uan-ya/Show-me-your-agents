import { useEffect, useMemo, useState } from "react";

import {
  type AppView,
  type Insight,
  type MarketingBrief,
} from "../types";

interface Props {
  clientId: number | null;
  brief: MarketingBrief;
  insights: Insight[];
  onNavigate: (view: AppView) => void;
}

type ApprovalState = "draft" | "approved" | "rejected";

interface CalendarItem {
  day: string;
  channel: string;
  content: string;
  purpose: string;
  evidence: Insight | null;
}

function pickInsight(insights: Insight[], categories: string[]): Insight | null {
  return (
    insights.find((insight) => categories.includes(insight.category)) ??
    insights[0] ??
    null
  );
}

export function CampaignPlan({ clientId, brief, insights, onNavigate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [approval, setApproval] = useState<ApprovalState>("draft");

  const briefReady = Boolean(
    brief.objective.trim() &&
      brief.target_audience.trim() &&
      brief.channels.length > 0,
  );
  const evidenceReady = insights.length > 0;

  useEffect(() => {
    setGenerated(false);
    setApproval("draft");
  }, [clientId, brief, insights]);

  const driver = useMemo(
    () =>
      pickInsight(insights, [
        "PURCHASE_DRIVER",
        "RETENTION_DRIVER",
        "TRIAL_DRIVER",
      ]),
    [insights],
  );
  const concern = useMemo(
    () =>
      pickInsight(insights, [
        "PAIN_POINT",
        "CUSTOMER_ANXIETY",
        "NON_REPEAT_DRIVER",
        "UNMET_NEED",
      ]),
    [insights],
  );

  const calendar = useMemo<CalendarItem[]>(() => {
    const channels = brief.channels.length > 0 ? brief.channels : ["Primary channel"];
    return [
      {
        day: "Day 1",
        channel: channels[0],
        content: driver
          ? `Customer proof: ${driver.title}`
          : "Lead with the strongest customer-supported value",
        purpose: "Awareness",
        evidence: driver,
      },
      {
        day: "Day 3",
        channel: channels[1 % channels.length],
        content: concern
          ? `Address the concern: ${concern.title}`
          : "Answer the most important customer concern",
        purpose: "Trust",
        evidence: concern,
      },
      {
        day: "Day 5",
        channel: channels[2 % channels.length],
        content: "Show the offer in use with a clear next step",
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
  }, [brief.channels, concern, driver]);

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
          <span className="prototype-pill">
            Frontend prototype
          </span>
        </header>

        <div className="prototype-note">
          <span aria-hidden="true">◇</span>
          <p>
            This screen simulates the proposal's campaign-planning handoff in the
            browser. It is evidence-linked, but it is not yet persisted or generated
            by a campaign backend.
          </p>
        </div>

        {clientId === null && (
          <EmptyStep
            title="Choose an SME client first"
            copy="Create or select the client whose campaign you want to plan."
            action="Set up client and data"
            onClick={() => onNavigate("import")}
          />
        )}

        {clientId !== null && !briefReady && (
          <EmptyStep
            title="Complete the campaign brief"
            copy="Add a business objective, target audience and at least one marketing channel."
            action="Complete client brief"
            onClick={() => onNavigate("import")}
          />
        )}

        {clientId !== null && briefReady && !evidenceReady && (
          <EmptyStep
            title="Customer evidence is required"
            copy="Analyse customer feedback before generating campaign direction."
            action="Open customer insights"
            onClick={() => onNavigate("insights")}
          />
        )}

        {clientId !== null && briefReady && evidenceReady && !generated && (
          <section className="campaign-gate">
            <div>
              <p className="section-kicker">Inputs ready</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Build a campaign draft from {insights.length} insight
                {insights.length === 1 ? "" : "s"}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Objective: {brief.objective}. Audience: {brief.target_audience}.
                Channels: {brief.channels.join(", ")}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGenerated(true)}
              className="primary-button"
            >
              Generate frontend draft
            </button>
          </section>
        )}

        {generated && briefReady && evidenceReady && (
          <>
            <section className="plan-summary-grid">
              <article className="surface-card recommendation-card p-5 sm:p-6 xl:col-span-2">
                <p className="section-kicker">Campaign recommendation</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Lead with customer-supported value, then remove the strongest
                  barrier to action.
                </h2>
                <p className="mt-3 text-base leading-7 text-slate-300">
                  Pursue <strong>{brief.objective}</strong> for {brief.target_audience}.
                  {driver ? ` Anchor the message in “${driver.title}”.` : ""}
                  {concern ? ` Address “${concern.title}” directly.` : ""}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {[driver, concern]
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
                  <li><strong className="text-cyan-300">1.</strong> State the customer value in plain language.</li>
                  <li><strong className="text-cyan-300">2.</strong> Prove it with real customer evidence.</li>
                  <li><strong className="text-cyan-300">3.</strong> Resolve the main hesitation before the call to action.</li>
                </ol>
              </article>
            </section>

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
                    {calendar.map((item) => (
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
                    Approval is simulated locally for the frontend prototype.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setApproval("rejected")}
                    className="secondary-button"
                  >
                    Request revision
                  </button>
                  <button
                    type="button"
                    onClick={() => setApproval("approved")}
                    className="success-button"
                  >
                    Approve campaign
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
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
    <section className="surface-card empty-step-card p-8 text-center">
      <span className="empty-step-mark" aria-hidden="true">↗</span>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">
        {copy}
      </p>
      <button type="button" onClick={onClick} className="primary-button mt-5">
        {action}
      </button>
    </section>
  );
}
