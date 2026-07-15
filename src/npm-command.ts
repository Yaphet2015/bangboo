export interface NpmCommandOptions {
  nodeExecutable?: string;
  npmExecPath?: string;
}

export interface ResolvedCommand {
  command: string;
  args: string[];
}

export function resolveNpmCommand(args: string[], options: NpmCommandOptions = {}): ResolvedCommand {
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: options.nodeExecutable ?? process.execPath,
      args: [npmExecPath, ...args],
    };
  }
  return { command: "npm", args };
}
