import { useEffect, useMemo, useState } from "react";

import { api, isAbortError } from "../api/client";
import { useOptionalAuth } from "../auth/AuthContext";
import type { AppView, CampaignCalendarItem, Client } from "../types";
import { CAMPAIGN_CALENDAR_UPDATED_EVENT, clientActivityColorStyle } from "../utils/campaignColors";

interface Props {
  onNavigate: (view: AppView) => void;
  onClientDeleted?: (clientId: number) => void;
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

function isInMonth(value: string, month: CalendarMonth): boolean {
  return value.startsWith(`${month.year}-${String(month.month + 1).padStart(2, "0")}-`);
}

function monthDays(value: CalendarMonth): Array<number | null> {
  const firstWeekday = new Date(value.year, value.month, 1).getDay();
  const totalDays = new Date(value.year, value.month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function statusTone(status: CampaignCalendarItem["status"]): string {
  if (status === "scheduled") return "is-scheduled";
  if (status === "published") return "is-ready";
  if (status === "cancelled") return "is-review";
  return "is-draft";
}

export function CampaignCalendar({ onNavigate, onClientDeleted }: Props) {
  const auth = useOptionalAuth();
  const canManageClients = !auth?.currentUser || auth.currentUser.role === "admin";
  const canEditSchedule = !auth?.currentUser
    || auth.currentUser.role === "admin"
    || auth.currentUser.role === "strategist";
  const [displayedMonth, setDisplayedMonth] = useState<CalendarMonth>(currentMonth);
  const [items, setItems] = useState<CampaignCalendarItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [clientFilter, setClientFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleChannels, setVisibleChannels] = useState<string[]>([]);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void api.listCalendarItems({}, controller.signal).then(
      (records) => {
        if (controller.signal.aborted) return;
        setItems(records);
        setVisibleChannels((current) => current.length > 0 ? current : Array.from(new Set(records.map((item) => item.channel))));
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
  }, [reloadVersion]);

  useEffect(() => {
    const controller = new AbortController();
    void api.listClients(controller.signal).then(
      (records) => {
        if (!controller.signal.aborted) setClients(records);
      },
      (reason: unknown) => {
        if (!controller.signal.aborted && !isAbortError(reason)) setClientError("Unable to load the customer database.");
      },
    );
    return () => controller.abort();
  }, [reloadVersion]);

  const clientOptions = useMemo(
    () => {
      const merged = new Map(clients.map((client) => [client.id, client]));
      items.forEach((item) => {
        if (!merged.has(item.client_id)) {
          merged.set(item.client_id, {
            id: item.client_id,
            name: item.client_name,
            industry: null,
            description: null,
            created_at: "",
            updated_at: "",
          });
        }
      });
      return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
    },
    [clients, items],
  );

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
  const calendarItems = useMemo(
    () => filteredItems.filter((item) => isInMonth(item.publish_date, displayedMonth) && visibleChannels.includes(item.channel)),
    [displayedMonth, filteredItems, visibleChannels],
  );
  const calendarCells = useMemo(() => monthDays(displayedMonth), [displayedMonth]);
  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, CampaignCalendarItem[]>();
    calendarItems.forEach((item) => {
      const existing = grouped.get(item.publish_date) ?? [];
      existing.push(item);
      grouped.set(item.publish_date, existing);
    });
    return grouped;
  }, [calendarItems]);
  const clientColorById = useMemo(() => {
    const ids = Array.from(new Set(items.map((item) => item.client_id))).sort((left, right) => left - right);
    return new Map(ids.map((id, index) => [id, index % 6]));
  }, [items]);
  const selectedItems = useMemo(
    () => selectedDate ? (itemsByDate.get(selectedDate) ?? []) : [],
    [itemsByDate, selectedDate],
  );

  const changeMonth = (offset: number) => {
    const nextMonth = moveMonth(displayedMonth, offset);
    setDisplayedMonth(nextMonth);
    setSelectedDate(null);
    void api.listCalendarItems(monthRange(nextMonth)).then((records) => {
      setItems((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        records.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values());
      });
    }).catch(() => undefined);
  };

  const toggleChannel = (channel: string) => {
    setVisibleChannels((current) => current.includes(channel)
      ? current.filter((value) => value !== channel)
      : [...current, channel]);
  };

  const label = monthLabel(displayedMonth);

  const updateItemStatus = async (
    item: CampaignCalendarItem,
    nextStatus: CampaignCalendarItem["status"],
  ) => {
    if (item.status === nextStatus) return;
    setUpdatingItemId(item.id);
    setStatusError(null);
    try {
      const updated = await api.updateCalendarItemStatus(item.id, nextStatus);
      setItems((current) => current.map((candidate) =>
        candidate.id === updated.id ? updated : candidate,
      ));
      window.dispatchEvent(new Event(CAMPAIGN_CALENDAR_UPDATED_EVENT));
    } catch (reason) {
      if (!isAbortError(reason)) setStatusError("Unable to update the simulated publishing status.");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const deleteClient = async (client: Client) => {
    if (!window.confirm(`Delete ${client.name} and all of its stored data?`)) return;
    setDeletingClientId(client.id);
    setClientError(null);
    try {
      await api.deleteClient(client.id);
      setClients((current) => current.filter((candidate) => candidate.id !== client.id));
      setItems((current) => current.filter((item) => item.client_id !== client.id));
      if (clientFilter === String(client.id)) setClientFilter("all");
      onClientDeleted?.(client.id);
      window.dispatchEvent(new Event(CAMPAIGN_CALENDAR_UPDATED_EVENT));
    } catch (reason) {
      if (!isAbortError(reason)) setClientError("Unable to delete this customer and its stored data.");
    } finally {
      setDeletingClientId(null);
    }
  };

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

        <section className="surface-card p-5 sm:p-6" aria-labelledby="records-title">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-kicker">Customer database</p>
              <h2 id="records-title" className="mt-1 text-xl font-semibold text-white">Customers and campaign records</h2>
              <p className="mt-2 text-sm text-slate-400">Every generated campaign stays connected to its customer.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => onNavigate("import")}>
              Add campaign <span aria-hidden>+</span>
            </button>
          </div>

          <div className="mb-5 grid gap-3 border-y border-slate-800 py-4 sm:grid-cols-3">
            <label className="filter-control">
              Client
              <select className="mt-2 block w-full rounded-lg border px-3 py-2" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                <option value="all">All Clients</option>
                {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <label className="filter-control">
              Channel
              <select className="mt-2 block w-full rounded-lg border px-3 py-2" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                <option value="all">All Channels</option>
                {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </label>
            <label className="filter-control">
              Status
              <select className="mt-2 block w-full rounded-lg border px-3 py-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                {statuses.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
              </select>
            </label>
          </div>

          {clientError && <p role="alert" className="mb-4 text-sm text-amber-300">{clientError}</p>}
          {statusError && <p role="alert" className="mb-4 text-sm text-amber-300">{statusError}</p>}
          {loading && <p role="status" className="py-10 text-center text-sm text-slate-300">Loading campaign schedule…</p>}
          {!loading && error && (
            <div role="alert" className="py-10 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <button type="button" className="secondary-button mt-4" onClick={() => setReloadVersion((value) => value + 1)}>Retry</button>
            </div>
          )}
          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="campaign-records-table">
                <thead>
                  <tr><th>Customer</th><th>Campaigns</th><th>Channels</th><th>Last activity</th><th><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {clientOptions
                    .filter((client) => clientFilter === "all" || client.id === Number(clientFilter))
                    .map((client) => {
                      const clientItems = filteredItems.filter((item) => item.client_id === client.id);
                      const campaignCount = new Set(clientItems.map((item) => item.campaign_id)).size;
                      const clientChannels = Array.from(new Set(clientItems.map((item) => item.channel))).join(", ") || "—";
                      const activityDates = clientItems.map((item) => item.publish_date).sort();
                      const lastActivity = activityDates[activityDates.length - 1];
                      return (
                        <tr key={client.id}>
                          <td><strong>{client.name}</strong><small>{client.industry || "SME customer"}</small></td>
                          <td>{campaignCount}</td>
                          <td>{clientChannels}</td>
                          <td>{lastActivity ? `Last: ${publishDateLabel(lastActivity)}` : "No scheduled activity"}</td>
                          <td className="text-right">{canManageClients && <button type="button" className="danger-button" disabled={deletingClientId === client.id} onClick={() => void deleteClient(client)}>{deletingClientId === client.id ? "Deleting…" : "Delete customer"}</button>}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {clientOptions.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No customers have been added yet.</p>}
            </div>
          )}
        </section>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="calendar-view-title">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-kicker">Calendar view</p>
              <h2 id="calendar-view-title" className="mt-1 text-xl font-semibold text-white">{label} campaign activity</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="secondary-button" aria-label="Previous month" onClick={() => changeMonth(-1)}>Previous</button>
              <button type="button" className="secondary-button" aria-label="Next month" onClick={() => changeMonth(1)}>Next</button>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Calendar activity filters">
            <span className="filter-control mr-2">Show channels:</span>
            {channels.map((channel) => (
              <button key={channel} type="button" className={`calendar-filter-chip ${visibleChannels.includes(channel) ? "is-active" : ""}`} aria-pressed={visibleChannels.includes(channel)} onClick={() => toggleChannel(channel)}>
                {channel}
              </button>
            ))}
          </div>

          <div className="campaign-month-legend" aria-label="Customer activity colours">
            {clientOptions
              .filter((client) => calendarItems.some((item) => item.client_id === client.id))
              .map((client) => (
                <span key={client.id}>
                  <i style={clientActivityColorStyle(clientColorById.get(client.id) ?? 0)} aria-hidden="true" />
                  {client.name}
                </span>
              ))}
          </div>

          <div className="campaign-month-calendar" aria-label={`${label} campaign calendar`}>
            <div className="campaign-month-weekdays" aria-hidden="true">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="campaign-month-grid">
              {calendarCells.map((day, index) => {
                if (day === null) return <span key={`blank-${index}`} className="campaign-month-day is-empty" aria-hidden="true" />;
                const key = dateKey(displayedMonth.year, displayedMonth.month, day);
                const dayItems = itemsByDate.get(key) ?? [];
                const isToday = key === dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                return (
                  <div key={key} className={`campaign-month-day ${selectedDate === key ? "is-selected" : ""} ${isToday ? "is-today" : ""}`}>
                    <button
                      type="button"
                      className="campaign-month-number"
                      onClick={() => dayItems.length > 0 && setSelectedDate(key)}
                      aria-label={`${publishDateLabel(key)}${dayItems.length > 0 ? `, ${dayItems.length} activities` : ", no activities"}`}
                      disabled={dayItems.length === 0}
                    >
                      {day}
                    </button>
                    <div className="campaign-month-dots">
                      {dayItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="campaign-month-dot"
                          style={clientActivityColorStyle(clientColorById.get(item.client_id) ?? 0)}
                          aria-label={`${item.client_name}: ${item.content} on ${publishDateLabel(item.publish_date)}`}
                          title={`${item.client_name} · ${item.content}`}
                          onClick={() => setSelectedDate(key)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {calendarItems.length === 0 && (
            <div className="py-6 text-center"><p className="text-sm text-slate-400">{items.length === 0 ? "No campaigns scheduled for this month." : "No activities match the current calendar filters."}</p></div>
          )}

          {selectedDate && selectedItems.length > 0 && (
            <div className="campaign-day-details" aria-live="polite">
              <div className="campaign-day-details-heading">
                <div>
                  <p className="section-kicker">Selected date</p>
                  <h3>{publishDateLabel(selectedDate)} activities</h3>
                </div>
                <button type="button" className="secondary-button" onClick={() => setSelectedDate(null)}>Close details</button>
              </div>
              <div className="campaign-calendar-list" aria-label={`${publishDateLabel(selectedDate)} campaign schedule`}>
                {selectedItems.map((item) => (
                  <article key={item.id} className="campaign-calendar-row">
                    <i className="campaign-detail-dot" style={clientActivityColorStyle(clientColorById.get(item.client_id) ?? 0)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <time className="campaign-calendar-date" dateTime={item.publish_date}>{publishDateLabel(item.publish_date)}</time>
                      <strong>{item.content}</strong>
                      <small>{item.campaign_name} · {item.client_name} · {item.channel}</small>
                      {(item.content_type || item.cta || item.owner) && <small>{[item.content_type, item.cta ? `CTA: ${item.cta}` : null, item.owner ? `Owner: ${item.owner}` : null].filter(Boolean).join(" · ")}</small>}
                    </div>
                    <label className={`campaign-status ${statusTone(item.status)}`}>
                      <span className="sr-only">Publishing status for {item.content}</span>
                      <select aria-label={`Publishing status for ${item.content}`} value={item.status} disabled={!canEditSchedule || updatingItemId === item.id} onChange={(event) => void updateItemStatus(item, event.target.value as CampaignCalendarItem["status"])} className="bg-transparent font-semibold outline-none">
                        {Object.entries(STATUS_LABELS).map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}
                      </select>
                    </label>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
