// Hook that polls the backend health endpoint once on mount and exposes the
// connection state for the UI.

import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { ConnectionState } from "../types";

export function useHealthCheck(): ConnectionState {
  const [state, setState] = useState<ConnectionState>("checking");

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((res) => {
        if (!cancelled) setState(res.status === "ok" ? "connected" : "error");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
