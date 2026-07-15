import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseUpstreamLock } from "../../src/upstream-lock.js";

describe("parseUpstreamLock", () => {
  test("accepts the pinned v0.80.7 runtime", async () => {
    const raw = await readFile(new URL("../../upstream.lock.json", import.meta.url), "utf8");

    expect(parseUpstreamLock(raw)).toMatchObject({
      tag: "v0.80.7",
      commit: "818d67457cdd6b60bce6b121d16b23141c252dd8",
      codingAgent: { version: "0.80.7" },
    });
  });

  test("rejects runtime package version drift", () => {
    const raw = JSON.stringify({
      repository: "https://example.test/pi.git",
      tag: "v1.2.3",
      commit: "a".repeat(40),
      codingAgent: { package: "@earendil-works/pi-coding-agent", version: "1.2.3", path: "packages/coding-agent" },
      runtimePackages: { "@earendil-works/pi-ai": "1.2.2" },
    });

    expect(() => parseUpstreamLock(raw)).toThrow(/must match coding-agent version/);
  });
});
