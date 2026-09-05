import type { ConnectionState } from "../types";
import { connectionLabel } from "../utils/format";

interface Props {
  state: ConnectionState;
}

// Displays the backend connection state with a colour-coded indicator.
export function StatusBadge({ state }: Props) {
  const color =
    state === "connected"
      ? "bg-green-500"
      : state === "error"
        ? "bg-red-500"
        : "bg-amber-400";

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2">
      <span className={`h-3 w-3 rounded-full ${color}`} aria-hidden />
      <span className="text-sm font-medium text-slate-100">
        {connectionLabel(state)}
      </span>
    </div>
  );
}
