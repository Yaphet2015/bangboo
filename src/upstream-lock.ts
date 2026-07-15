export interface UpstreamLock {
  repository: string;
  tag: string;
  commit: string;
  codingAgent: {
    package: string;
    version: string;
    path: string;
  };
  runtimePackages: Record<string, string>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

export function parseUpstreamLock(raw: string): UpstreamLock {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("upstream lock must be an object");
  }

  const record = value as Record<string, unknown>;
  const codingAgentValue = record.codingAgent;
  const runtimePackagesValue = record.runtimePackages;
  if (typeof codingAgentValue !== "object" || codingAgentValue === null || Array.isArray(codingAgentValue)) {
    throw new Error("codingAgent must be an object");
  }
  if (typeof runtimePackagesValue !== "object" || runtimePackagesValue === null || Array.isArray(runtimePackagesValue)) {
    throw new Error("runtimePackages must be an object");
  }

  const codingAgent = codingAgentValue as Record<string, unknown>;
  const version = requireString(codingAgent.version, "codingAgent.version");
  const runtimePackages = Object.fromEntries(
    Object.entries(runtimePackagesValue).map(([name, packageVersion]) => [
      name,
      requireString(packageVersion, `runtimePackages.${name}`),
    ]),
  );
  for (const [name, packageVersion] of Object.entries(runtimePackages)) {
    if (packageVersion !== version) {
      throw new Error(`${name} version ${packageVersion} must match coding-agent version ${version}`);
    }
  }

  const commit = requireString(record.commit, "commit");
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error("commit must be a full 40-character Git SHA");
  }

  return {
    repository: requireString(record.repository, "repository"),
    tag: requireString(record.tag, "tag"),
    commit,
    codingAgent: {
      package: requireString(codingAgent.package, "codingAgent.package"),
      version,
      path: requireString(codingAgent.path, "codingAgent.path"),
    },
    runtimePackages,
  };
}
