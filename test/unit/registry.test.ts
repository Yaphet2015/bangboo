import { describe, expect, test } from "vitest";
import { parseLatestPackageMetadata, registryLatestUrl } from "../../src/registry.js";

describe("Bangboo registry metadata", () => {
  test("uses only the npm registry Bangboo endpoint", () => {
    expect(registryLatestUrl()).toBe("https://registry.npmjs.org/bangboo/latest");
  });

  test("accepts valid latest metadata", () => {
    expect(parseLatestPackageMetadata({ name: "bangboo", version: "0.2.0" })).toEqual({
      packageName: "bangboo",
      version: "0.2.0",
    });
  });

  test("rejects package substitution", () => {
    expect(() => parseLatestPackageMetadata({ name: "@earendil-works/pi-coding-agent", version: "0.80.7" })).toThrow(
      /Unexpected package/,
    );
  });
});
