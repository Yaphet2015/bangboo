import { describe, expect, test } from "vitest";
import { prepareBangbooEnvironment } from "../../src/environment.js";

describe("prepareBangbooEnvironment", () => {
  test("maps public Bangboo variables before runtime import", () => {
    const env = prepareBangbooEnvironment({
      BANGBOO_OFFLINE: "1",
      PI_OFFLINE: "0",
      BANGBOO_SHARE_VIEWER_URL: "https://share.example/session/",
    });

    expect(env).toMatchObject({
      BANGBOO_CODING_AGENT: "true",
      PI_CODING_AGENT: "true",
      PI_OFFLINE: "1",
      PI_SHARE_VIEWER_URL: "https://share.example/session/",
      PI_TELEMETRY: "0",
    });
    expect(env.PI_SKIP_VERSION_CHECK).toBeUndefined();
  });

  test("preserves a legacy compatibility variable when no Bangboo override exists", () => {
    const env = prepareBangbooEnvironment({ PI_TIMING: "1" });

    expect(env.PI_TIMING).toBe("1");
  });
});
