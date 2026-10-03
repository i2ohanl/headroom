// Usage: node --env-file=.env.local scripts/extract-sample.ts [samples/<folder> ...]
// With no arguments, runs every folder in /samples. Sends each folder's PDFs in one call.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractAssignments } from "../src/lib/extraction.ts";

const root = "samples";
const folders = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(root).map((f) => join(root, f)).filter((p) => statSync(p).isDirectory());

for (const folder of folders) {
  const pdfs = readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => ({ name: f, data: readFileSync(join(folder, f)) }));
  console.log(`\n=== ${folder}: ${pdfs.map((p) => p.name).join(", ")}`);
  const started = Date.now();
  const { result, usage } = await extractAssignments(pdfs);
  console.log(JSON.stringify(result, null, 2));
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s, ${usage.input_tokens} in / ${usage.output_tokens} out tokens)`);
}
