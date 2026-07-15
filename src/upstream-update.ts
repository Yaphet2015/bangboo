import type { UpstreamLock } from "./upstream-lock.js";

export function buildUpdatedLock(current: UpstreamLock, version: string, commit: string): UpstreamLock {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`Invalid upstream version ${version}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error("Upstream tag must resolve to a full Git SHA");
  }

  return {
    ...current,
    tag: `v${version}`,
    commit,
    codingAgent: { ...current.codingAgent, version },
    runtimePackages: Object.fromEntries(Object.keys(current.runtimePackages).map((name) => [name, version])),
  };
}

export function replaceProvenance(content: string, current: UpstreamLock, updated: UpstreamLock): string {
  return content
    .split(current.codingAgent.version)
    .join(updated.codingAgent.version)
    .split(current.tag)
    .join(updated.tag)
    .split(current.commit)
    .join(updated.commit);
}

export function markCompatibilityPending(content: string): string {
  if (!/^- Status: .+$/mu.test(content)) throw new Error("Compatibility report has no status field");
  return content.replace(/^- Status: .+$/mu, "- Status: pending CI validation");
}
