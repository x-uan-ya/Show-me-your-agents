import type { AppView } from "../types";

interface Props { onNavigate: (view: AppView) => void; }

const CAMPAIGNS = [
  { client: "Harbour Brew", campaign: "Trial offer refresh", channel: "Instagram", date: "Sep 16", status: "Ready for review", tone: "is-ready" },
  { client: "Northstar Pilates", campaign: "Retention stories", channel: "Email", date: "Sep 18", status: "Draft", tone: "is-draft" },
  { client: "Harbour Brew", campaign: "New customer proof", channel: "LinkedIn", date: "Sep 20", status: "Scheduled", tone: "is-scheduled" },
  { client: "Lumen Dental", campaign: "Reduce first-visit friction", channel: "Facebook", date: "Sep 22", status: "Needs approval", tone: "is-review" },
];

export function CampaignCalendar({ onNavigate }: Props) {
  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Campaign coordination</p>
            <h1>Campaign calendar</h1>
            <p>Coordinate client campaigns, review publishing dates and catch scheduling conflicts.</p>
          </div>
          <span className="context-pill">4 active campaigns</span>
        </header>

        <section className="surface-card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-kicker">All campaigns</p>
              <h2 className="mt-1 text-xl font-semibold text-white">September publishing schedule</h2>
            </div>
            <button type="button" className="primary-button" onClick={() => onNavigate("campaign-plan")}>Add campaign <span aria-hidden>+</span></button>
          </div>
          <div className="campaign-calendar-list">
            {CAMPAIGNS.map((item) => (
              <article key={`${item.client}-${item.campaign}`} className="campaign-calendar-row">
                <div><span className="campaign-calendar-date">{item.date}</span><strong>{item.campaign}</strong><small>{item.client} · {item.channel}</small></div>
                <span className={`campaign-status ${item.tone}`}>{item.status}</span>
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-card p-5 sm:p-6"><p className="section-kicker">Coordination check</p><h2 className="mt-1 text-xl font-semibold text-white">No scheduling conflicts</h2><p className="mt-2 text-sm leading-6 text-slate-400">Campaign dates are separated across clients and channels.</p></section>
          <section className="surface-card p-5 sm:p-6"><p className="section-kicker">Approval queue</p><h2 className="mt-1 text-xl font-semibold text-white">1 campaign needs review</h2><p className="mt-2 text-sm leading-6 text-slate-400">Review the campaign direction before publishing.</p></section>
        </div>
      </div>
    </main>
  );
}
