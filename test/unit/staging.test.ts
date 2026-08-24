import { readdir } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { buildStagingCommands } from "../../src/staging.js";

describe("buildStagingCommands", () => {
  test("checks every patch before applying it", () => {
    const commands = buildStagingCommands({
      repository: "https://example.test/pi.git",
      commit: "a".repeat(40),
      cacheDir: "/tmp/cache",
      stageDir: "/tmp/stage",
      patches: ["/repo/patches/0001.patch", "/repo/patches/0002.patch"],
    });

    expect(commands.slice(-4)).toEqual([
      { command: "git", args: ["apply", "--check", "/repo/patches/0001.patch"], cwd: "/tmp/stage" },
      { command: "git", args: ["apply", "/repo/patches/0001.patch"], cwd: "/tmp/stage" },
      { command: "git", args: ["apply", "--check", "/repo/patches/0002.patch"], cwd: "/tmp/stage" },
      { command: "git", args: ["apply", "/repo/patches/0002.patch"], cwd: "/tmp/stage" },
    ]);
  });

  test("ends with the newest numbered patch", async () => {
    const patchDir = new URL("../../patches/", import.meta.url);
    const patches = (await readdir(patchDir)).filter((name) => name.endsWith(".patch")).sort();

    expect(patches.at(-1)).toBe("0008-native-acp-mode.patch");
  });
});
