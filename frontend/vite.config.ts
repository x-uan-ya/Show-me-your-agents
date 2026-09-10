import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vite configuration for the React + TypeScript frontend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    restoreMocks: true,
  },
});
