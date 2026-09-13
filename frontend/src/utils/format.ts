// Small presentation helpers.

import type { ConnectionState } from "../types";

export function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case "connected":
      return "System Connected";
    case "error":
      return "System Disconnected";
    default:
      return "Connecting...";
  }
}

// Tailwind classes for a confidence badge. Confidence is a qualitative band,
// not a probability, so styling is deliberately low-key.
export function confidenceBadgeClass(label: string): string {
  switch (label) {
    case "High":
      return "bg-emerald-900/60 text-emerald-200 border border-emerald-700";
    case "Medium":
      return "bg-amber-900/60 text-amber-200 border border-amber-700";
    default:
      return "bg-slate-800 text-slate-300 border border-slate-600";
  }
}

// Heuristic: our synthetic development dataset uses external ids / metadata keys
// prefixed "SD-". Used only to surface a visible "synthetic data" label so demo
// data is never mistaken for real customer data.
export function looksSynthetic(signal: {
  external_id?: string | null;
  metadata?: Record<string, unknown>;
}): boolean {
  if (signal.external_id && signal.external_id.startsWith("SD-")) return true;
  const meta = signal.metadata ?? {};
  return Object.values(meta).some(
    (v) => typeof v === "string" && v.startsWith("SD-"),
  );
}
