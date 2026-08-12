import { spawn } from "node:child_process";

export interface AcpInitializeResult {
  response: {
    protocolVersion: number;
    agentInfo?: { name: string; version: string } | null;
  };
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function initializeAcpProcess(
  cliPath: string,
  _packageRoot: string,
  cwd: string,
  home: string,
): Promise<AcpInitializeResult> {
  const child = spawn(process.execPath, [cliPath, "acp"], {
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home, BANGBOO_OFFLINE: "1", NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  child.stdin.end(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "bangboo-integration-test", version: "1.0.0" },
    },
  })}\n`);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const messages = stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
    id?: number;
    result?: AcpInitializeResult["response"];
  });
  const response = messages.find((message) => message.id === 1)?.result;
  if (!response) throw new Error(`ACP initialize response missing; stderr: ${stderr}`);
  return { response, stdout, stderr, exitCode };
}
