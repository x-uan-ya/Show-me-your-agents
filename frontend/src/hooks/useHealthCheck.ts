import { useEffect, useState } from "react";

import { api, isAbortError } from "../api/client";
import type { ConnectionState } from "../types";

export function useHealthCheck(): ConnectionState {
  const [state, setState] = useState<ConnectionState>("checking");

  useEffect(() => {
    let controller: AbortController | null = null;

    const check = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await api.health(controller.signal);
        if (!controller.signal.aborted) {
          setState(response.status === "ok" ? "connected" : "error");
        }
      } catch (error) {
        if (!isAbortError(error)) setState("error");
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), 30_000);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
    };
  }, []);

  return state;
}
