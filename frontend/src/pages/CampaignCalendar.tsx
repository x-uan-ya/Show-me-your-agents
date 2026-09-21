import { useEffect, useMemo, useState } from "react";

import { api, isAbortError } from "../api/client";
import type { AppView, CampaignCalendarItem } from "../types";

interface Props {
  onNavigate: (view: AppView) => void;
}

interface CalendarMonth {
  year: number;
  month: number;
}

const STATUS_LABELS: Record<CampaignCalendarItem["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  cancelled: "Cancelled",
};

function currentMonth(): CalendarMonth {
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthRange(value: CalendarMonth): { startDate: string; endDate: string } {
  const lastDay = new Date(value.year, value.month + 1, 0).getDate();
  return {
    startDate: dateKey(value.year, value.month, 1),
    endDate: dateKey(value.year, value.month, lastDay),
  };
}

function monthLabel(value: CalendarMonth): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(value.year, value.month, 1));
}

function publishDateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function moveMonth(value: CalendarMonth, offset: number): CalendarMonth {
  const next = new Date(value.year, value.month + offset, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function statusTone(status: CampaignCalendarItem["status"]): string {
  if (status === "scheduled") return "is-scheduled";
  if (status === "published") return "is-ready";
  if (status === "cancelled") return "is-review";
  return "is-draft";
}

export function CampaignCalendar({ onNavigate }: Props) {
  const [displayedMonth, setDisplayedMonth] = useState<CalendarMonth>(currentMonth);
  const [items, setItems] = useState<CampaignCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [clientFilter, setClientFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    const range = monthRange(displayedMonth);
    setLoading(true);
    setError(null);

    void api.listCalendarItems(range, controller.signal).then(
      (records) => {
        if (controller.signal.aborted) return;
        setItems(records);
        setLoading(false);
      },
      (reason: unknown) => {
        if (controller.signal.aborted || isAbortError(reason)) return;
        setItems([]);
        setError("Unable to load campaign schedule.");
        setLoading(false);
      },
    );

    return () => controller.abort();
  }, [displayedMonth, reloadVersion]);

  const clients = useMemo(() => {
    const unique = new Map<number, string>();
    items.forEach((item) => unique.set(item.client_id, item.client_name));
    return Array.from(unique, ([id, name]) => ({ id, name })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [items]);

  const channels = useMemo(
    () => Array.from(new Set(items.map((item) => item.channel))).sort(),
    [items],
  );
  const statuses = useMemo(
    () => Array.from(new Set(items.map((item) => item.status))).sort(),
    [items],
  );
  const filteredItems = useMemo(
    () => items.filter((item) =>
      (clientFilter === "all" || item.client_id === Number(clientFilter)) &&
      (channelFilter === "all" || item.channel === channelFilter) &&
      (statusFilter === "all" || item.status === statusFilter),
    ),
    [channelFilter, clientFilter, items, statusFilter],
  );

  const changeMonth = (offset: number) => {
    setDisplayedMonth((value) => moveMonth(value, offset));
    setClientFilter("all");
    setChannelFilter("all");
    setStatusFilter("all");
  };

  const label = monthLabel(displayedMonth);

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Campaign coordination</p>
            <h1>Campaign calendar</h1>
            <p>Review persisted publishing dates across clients, channels and statuses.</p>
          </div>
          <span className="context-pill">
            {loading ? "Loading schedule" : `${filteredItems.length} calendar item${filteredItems.length === 1 ? "" : "s"}`}
          </span>
        </header>

        <section className="surface-card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-kicker">All persisted campaigns</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{label} publishing schedule</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="secondary-button"
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="secondary-button"
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              >
                Next
              </button>
              <button type="button" className="primary-button" onClick={() => onNavigate("campaign-plan")}>
                Add campaign <span aria-hidden>+</span>
              </button>
            </div>
          </div>

          {!loading && !error && items.length > 0 && (
            <div className="mb-5 grid gap-3 border-y border-slate-800 py-4 sm:grid-cols-3">
              <label className="filter-control">
                Client
                <select
                  className="mt-2 block w-full rounded-lg border px-3 py-2"
                  value={clientFilter}
                  onChange={(event) => setClientFilter(event.target.value)}
                >
                  <option value="all">All Clients</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>
              <label className="filter-control">
                Channel
                <select
                  className="mt-2 block w-full rounded-lg border px-3 py-2"
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value)}
                >
                  <option value="all">All Channels</option>
                  {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </label>
              <label className="filter-control">
                Status
                <select
                  className="mt-2 block w-full rounded-lg border px-3 py-2"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All Statuses</option>
                  {statuses.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                </select>
              </label>
            </div>
          )}

          {loading && <p role="status" className="py-10 text-center text-sm text-slate-300">Loading campaign schedule…</p>}

          {!loading && error && (
            <div role="alert" className="py-10 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <button type="button" className="secondary-button mt-4" onClick={() => setReloadVersion((value) => value + 1)}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filteredItems.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-300">
                {items.length === 0
                  ? "No campaigns scheduled for this month."
                  : "No campaign items match the current filters."}
              </p>
              <button type="button" className="secondary-button mt-4" onClick={() => onNavigate("campaign-plan")}>
                Open Campaign Plan
              </button>
            </div>
          )}

          {!loading && !error && filteredItems.length > 0 && (
            <div className="campaign-calendar-list" aria-label={`${label} campaign schedule`}>
              {filteredItems.map((item) => (
                <article key={item.id} className="campaign-calendar-row">
                  <div>
                    <time className="campaign-calendar-date" dateTime={item.publish_date}>
                      {publishDateLabel(item.publish_date)}
                    </time>
                    <strong>{item.content}</strong>
                    <small>{item.campaign_name} · {item.client_name} · {item.channel}</small>
                    {(item.content_type || item.cta || item.owner) && (
                      <small>
                        {[
                          item.content_type,
                          item.cta ? `CTA: ${item.cta}` : null,
                          item.owner ? `Owner: ${item.owner}` : null,
                        ].filter(Boolean).join(" · ")}
                      </small>
                    )}
                  </div>
                  <span className={`campaign-status ${statusTone(item.status)}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
