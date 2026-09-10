import type { AppView } from "../types";

export const APP_VIEWS: AppView[] = [
  "dashboard",
  "import",
  "insights",
  "campaign-plan",
  "trial-retention",
];

export function hashForView(view: AppView): string {
  return `#/${view}`;
}

export function viewFromHash(hash: string): AppView {
  const candidate = hash.replace(/^#\/?/, "") as AppView;
  return APP_VIEWS.includes(candidate) ? candidate : "dashboard";
}
