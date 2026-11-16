// Runs under Keeper's own `tsx` (Keeper's sources use extensionless imports + zod, which plain node
// cannot load). Validates every data file with Keeper's own schemas, exactly as ingest does, and
// prints JSON: { files: { "<dir>/<file>": { error?: string, params: (object|null)[] } } }.
// `params[i]` is regulation i's validated (zod-parsed) parameters, or null when it failed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const keeperDir = process.argv[2];
const { waterDataset } = await import(pathToFileURL(join(keeperDir, "src/ingest/datasetSchema.ts")).href);
const { validateParameters } = await import(pathToFileURL(join(keeperDir, "src/params/index.ts")).href);

const dataRoot = join(keeperDir, "data");
const out: Record<string, { error?: string; params: unknown[] }> = {};
for (const dir of readdirSync(dataRoot).filter((f) => statSync(join(dataRoot, f)).isDirectory()).sort()) {
  for (const f of readdirSync(join(dataRoot, dir)).filter((n) => n.endsWith(".json")).sort()) {
    const raw = JSON.parse(readFileSync(join(dataRoot, dir, f), "utf8"));
    const parsed = waterDataset.safeParse(raw);
    if (!parsed.success) { out[`${dir}/${f}`] = { error: parsed.error.message, params: [] }; continue; }
    out[`${dir}/${f}`] = {
      params: parsed.data.regulations.map((r: { ruleType: string; parameters: unknown }) => {
        const v = validateParameters(r.ruleType, r.parameters);
        return v.success ? v.data : null;
      }),
    };
  }
}
process.stdout.write(JSON.stringify({ files: out }));
