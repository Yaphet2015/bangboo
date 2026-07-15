import { describe, expect, test } from "vitest";
import { resolveNpmCommand } from "../../src/npm-command.js";

describe("resolveNpmCommand", () => {
  test("runs npm's JavaScript entrypoint through Node when npm_execpath is available", () => {
    expect(
      resolveNpmCommand(["run", "verify"], {
        nodeExecutable: "C:\\nodejs\\node.exe",
        npmExecPath: "C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
      }),
    ).toEqual({
      command: "C:\\nodejs\\node.exe",
      args: ["C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js", "run", "verify"],
    });
  });

  test("falls back to npm when no npm entrypoint is available", () => {
    expect(resolveNpmCommand(["ci"], { nodeExecutable: "/usr/bin/node", npmExecPath: "" })).toEqual({
      command: "npm",
      args: ["ci"],
    });
  });
});
