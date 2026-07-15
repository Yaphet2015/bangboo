export interface CommandSpec {
  command: string;
  args: string[];
  cwd?: string;
}

export interface StagingCommandOptions {
  repository: string;
  commit: string;
  cacheDir: string;
  stageDir: string;
  patches: string[];
}

export function buildStagingCommands(options: StagingCommandOptions): CommandSpec[] {
  const commands: CommandSpec[] = [
    { command: "git", args: ["clone", "--filter=blob:none", "--no-checkout", options.repository, options.cacheDir] },
    { command: "git", args: ["fetch", "--force", "origin", options.commit], cwd: options.cacheDir },
    {
      command: "git",
      args: ["worktree", "add", "--detach", options.stageDir, options.commit],
      cwd: options.cacheDir,
    },
  ];

  for (const patch of options.patches) {
    commands.push(
      { command: "git", args: ["apply", "--check", patch], cwd: options.stageDir },
      { command: "git", args: ["apply", patch], cwd: options.stageDir },
    );
  }
  return commands;
}
