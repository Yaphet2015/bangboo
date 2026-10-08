import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseUpstreamLock } from "../../src/upstream-lock.js";

describe("parseUpstreamLock", () => {
  test("accepts the pinned v1.1.0 runtime", async () => {
    const raw = await readFile(new URL("../../upstream.lock.json", import.meta.url), "utf8");

    expect(parseUpstreamLock(raw)).toMatchObject({
      tag: "v1.1.0",
      commit: "abe508e1b89912adde45528136c3221eb69acdd7",
      codingAgent: { version: "1.1.0" },
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
