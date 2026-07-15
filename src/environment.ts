const COMPATIBILITY_VARIABLES = [
  "OFFLINE",
  "SHARE_VIEWER_URL",
  "TIMING",
  "STARTUP_BENCHMARK",
  "EXPERIMENTAL",
  "CLEAR_ON_SHRINK",
  "HARDWARE_CURSOR",
  "PACKAGE_DIR",
] as const;

export function prepareBangbooEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = { ...input };

  for (const suffix of COMPATIBILITY_VARIABLES) {
    const publicName = `BANGBOO_${suffix}`;
    const compatibilityName = `PI_${suffix}`;
    if (input[publicName] !== undefined) {
      output[compatibilityName] = input[publicName];
    }
  }

  output.BANGBOO_CODING_AGENT = "true";
  output.PI_CODING_AGENT = "true";
  output.PI_TELEMETRY = "0";
  return output;
}
