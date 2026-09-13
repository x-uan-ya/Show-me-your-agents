import { describe, expect, it } from "vitest";

import { hashForView, viewFromHash } from "./navigation";

describe("hash navigation", () => {
  it("round-trips every supported view", () => {
    expect(viewFromHash(hashForView("campaign-plan"))).toBe("campaign-plan");
    expect(viewFromHash(hashForView("trial-retention"))).toBe("trial-retention");
  });

  it("falls back safely for an unknown hash", () => {
    expect(viewFromHash("#/unknown")).toBe("dashboard");
    expect(viewFromHash("")).toBe("dashboard");
  });
});
