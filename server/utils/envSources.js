/**
 * envSources.js — boot-time environment-variable provenance helper.
 *
 * Sprint S-P0-FIX-7 (Step B). For each tracked env var, reports
 * whether the value came from the OS process environment or from
 * the local .env file (loaded by dotenv) — making post-deploy env
 * issues like F4-5 (legacy DATA_DIR drift) diagnosable from the
 * boot log alone, with no `lsof` + file-inspection at incident time.
 *
 * Pure function — no side effects, no I/O. Caller takes the snapshot
 * BEFORE dotenv.config() runs and passes it in.
 *
 *   const before = new Set(Object.keys(process.env));
 *   dotenv.config({ path: ... });
 *   for (const line of describeEnvSources(before, TRACKED)) {
 *     console.log(line);
 *   }
 *
 * Secret values are masked: any var name matching SENSITIVE_PATTERN
 * is reported as `<N chars>` instead of its raw value. CORS_ORIGINS
 * is intentionally NOT in the mask list — it's a public allowlist.
 */

export const SENSITIVE_PATTERN = /KEY|SECRET|TOKEN|PASSWORD|PWD|AUTH|HASH|PRIVATE/i;

export function describeEnvSources(envSnapshotBeforeDotenv, varNames) {
  const lines = [];
  for (const name of varNames) {
    const value = process.env[name];
    if (value === undefined) {
      lines.push(`  ${name}: <unset>`);
      continue;
    }
    if (value === '') {
      lines.push(`  ${name}: <empty> (likely misconfig)`);
      continue;
    }
    const fromOs = envSnapshotBeforeDotenv.has(name);
    const source = fromOs ? 'os env' : '.env file';
    const display = SENSITIVE_PATTERN.test(name) ? `<${value.length} chars>` : value;
    lines.push(`  ${name}: ${display} (from ${source})`);
  }
  return lines;
}
