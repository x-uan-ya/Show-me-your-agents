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
