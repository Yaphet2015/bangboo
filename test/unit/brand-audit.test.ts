import { describe, expect, test } from "vitest";
import { findBrandViolations } from "../../src/brand-audit.js";

describe("findBrandViolations", () => {
  test("flags user-facing upstream identity and data paths", () => {
    const violations = findBrandViolations(
      "fixture.ts",
      'console.log("Pi can help");\nconst path = "~/.pi/agent";\nfetch("https://pi.dev/api");',
    );

    expect(violations).toHaveLength(3);
  });

  test("allows protocol imports and compatibility environment variables", () => {
    const violations = findBrandViolations(
      "fixture.ts",
      'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";\nprocess.env.PI_CODING_AGENT = "true";',
    );

    expect(violations).toEqual([]);
  });
});
