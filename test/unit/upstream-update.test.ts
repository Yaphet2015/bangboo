import { describe, expect, test } from "vitest";
import { buildUpdatedLock, markCompatibilityPending, replaceProvenance } from "../../src/upstream-update.js";
import type { UpstreamLock } from "../../src/upstream-lock.js";

const current: UpstreamLock = {
  repository: "https://example.test/pi.git",
  tag: "v0.80.7",
  commit: "a".repeat(40),
  codingAgent: {
    package: "@earendil-works/pi-coding-agent",
    version: "0.80.7",
    path: "packages/coding-agent",
  },
  runtimePackages: {
    "@earendil-works/pi-agent-core": "0.80.7",
    "@earendil-works/pi-ai": "0.80.7",
    "@earendil-works/pi-tui": "0.80.7",
  },
};

describe("upstream update", () => {
  test("moves every runtime package to the same release", () => {
    const updated = buildUpdatedLock(current, "0.81.0", "b".repeat(40));

    expect(updated.tag).toBe("v0.81.0");
    expect(updated.commit).toBe("b".repeat(40));
    expect(updated.codingAgent.version).toBe("0.81.0");
    expect(new Set(Object.values(updated.runtimePackages))).toEqual(new Set(["0.81.0"]));
  });

  test("updates pinned provenance in patch and documentation text", () => {
    const result = replaceProvenance(
      "runtime 0.80.7 tag v0.80.7 commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      current,
      buildUpdatedLock(current, "0.81.0", "b".repeat(40)),
    );

    expect(result).toBe("runtime 0.81.0 tag v0.81.0 commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  test("marks a refreshed compatibility report as pending", () => {
    expect(markCompatibilityPending("# Report\n\n- Status: validated\n")).toContain("- Status: pending CI validation");
  });
});
