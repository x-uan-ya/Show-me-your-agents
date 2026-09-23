import type { AppView } from "../types";

export const APP_VIEWS: AppView[] = [
  "dashboard",
  "import",
  "insights",
  "campaign-plan",
  "trial-retention",
  "campaign-calendar",
  "team-access",
];

export function hashForView(view: AppView, clientId?: number | null): string {
  return clientId && clientId > 0
    ? `#/clients/${clientId}/${view}`
    : `#/${view}`;
}

export function viewFromHash(hash: string): AppView {
  const path = hash.replace(/^#\/?/, "");
  const clientRoute = /^clients\/\d+\/(.+)$/.exec(path);
  const candidate = (clientRoute?.[1] ?? path) as AppView;
  return APP_VIEWS.includes(candidate) ? candidate : "dashboard";
}

export function clientIdFromHash(hash: string): number | null {
  const match = /^#\/?clients\/(\d+)(?:\/|$)/.exec(hash);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
