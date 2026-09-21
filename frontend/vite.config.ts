/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

function apiProxyTarget(value: string | undefined): string {
  const configured = value?.trim() || "http://127.0.0.1:8000";
  const target = new URL(configured);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("VITE_API_PROXY_TARGET must use http:// or https://");
  }
  target.pathname = target.pathname.replace(/\/api\/?$/, "").replace(/\/$/, "");
  target.search = "";
  target.hash = "";
  return target.toString().replace(/\/$/, "");
}

// Vite + Vitest configuration for the React + TypeScript frontend.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiProxyTarget(env.VITE_API_PROXY_TARGET),
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      restoreMocks: true,
    },
  };
});
