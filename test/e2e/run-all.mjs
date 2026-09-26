// Roda todas as suítes e2e (*.e2e.mjs) em sequência; exit != 0 se alguma falhar.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
let failed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".e2e.mjs")).sort()) {
  if (only && !f.includes(only)) continue;
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, [join(dir, f)], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n✗ ${failed} suíte(s) falharam` : "\n✓ todas as suítes e2e passaram");
process.exitCode = failed ? 1 : 0;
