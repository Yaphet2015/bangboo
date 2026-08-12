import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

export interface AcpInitializeResult {
  response: {
    protocolVersion: number;
    agentInfo?: { name: string; version: string } | null;
  };
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface AcpSdk {
  PROTOCOL_VERSION: number;
  methods: { agent: { initialize: "initialize" } };
  ndJsonStream(
    output: WritableStream<Uint8Array>,
    input: ReadableStream<Uint8Array>,
  ): unknown;
  client(options: { name: string }): {
    connectWith<T>(stream: unknown, operation: (context: {
      request(
        method: "initialize",
        params: {
          protocolVersion: number;
          clientCapabilities: Record<string, never>;
          clientInfo: { name: string; version: string };
        },
      ): Promise<AcpInitializeResult["response"]>;
    }) => Promise<T>): Promise<T>;
  };
}

export async function initializeAcpProcess(
  cliPath: string,
  packageRoot: string,
  cwd: string,
  home: string,
): Promise<AcpInitializeResult> {
  const require = createRequire(join(packageRoot, "package.json"));
  const sdkPath = require.resolve("@agentclientprotocol/sdk");
  const acp = await import(pathToFileURL(sdkPath).href) as AcpSdk;
  const child = spawn(process.execPath, [cliPath, "acp"], {
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home, BANGBOO_OFFLINE: "1", NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  let protocolOutputOpen = true;
  const protocolOutput = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        if (protocolOutputOpen) controller.enqueue(chunk);
      });
      child.stdout.once("end", () => {
        if (protocolOutputOpen) controller.close();
      });
      child.stdout.once("error", (error) => {
        if (protocolOutputOpen) controller.error(error);
      });
    },
    cancel() {
      protocolOutputOpen = false;
    },
  });

  const stream = acp.ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, protocolOutput);
  const response = await acp.client({ name: "bangboo-integration-test" }).connectWith(stream, (context) =>
    context.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: "bangboo-integration-test", version: "1.0.0" },
    }),
  );
  child.stdin.destroy();
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  for (const line of stdout.split("\n").filter(Boolean)) JSON.parse(line);

  return { response, stdout, stderr, exitCode };
}
