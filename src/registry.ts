export interface LatestPackageMetadata {
  packageName: "bangboo";
  version: string;
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export function registryLatestUrl(): string {
  return "https://registry.npmjs.org/bangboo/latest";
}

export function parseLatestPackageMetadata(value: unknown): LatestPackageMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid npm registry response");
  }
  const record = value as Record<string, unknown>;
  if (record.name !== "bangboo") {
    throw new Error(`Unexpected package ${String(record.name)}`);
  }
  if (typeof record.version !== "string" || !SEMVER_PATTERN.test(record.version)) {
    throw new Error("Invalid Bangboo version from npm registry");
  }
  return { packageName: "bangboo", version: record.version };
}
