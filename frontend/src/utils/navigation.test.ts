import { describe, expect, it } from "vitest";

import { clientIdFromHash, hashForView, viewFromHash } from "./navigation";

describe("hash navigation", () => {
  it("round-trips every supported view", () => {
    expect(viewFromHash(hashForView("campaign-plan"))).toBe("campaign-plan");
    expect(viewFromHash(hashForView("trial-retention"))).toBe("trial-retention");
  });

  it("round-trips a client-scoped deep link", () => {
    const hash = hashForView("insights", 42);

    expect(hash).toBe("#/clients/42/insights");
    expect(viewFromHash(hash)).toBe("insights");
    expect(clientIdFromHash(hash)).toBe(42);
  });

  it("rejects missing or invalid client ids", () => {
    expect(clientIdFromHash("#/insights")).toBeNull();
    expect(clientIdFromHash("#/clients/0/insights")).toBeNull();
    expect(clientIdFromHash("#/clients/not-a-number/insights")).toBeNull();
  });

  it("falls back safely for an unknown hash", () => {
    expect(viewFromHash("#/unknown")).toBe("dashboard");
    expect(viewFromHash("")).toBe("dashboard");
  });
});
