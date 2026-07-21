import { readFile } from "node:fs/promises";
import path from "node:path";

const tracePath = path.join(
  process.cwd(),
  ".next",
  "server",
  "app",
  "api",
  "anki-exports",
  "route.js.nft.json",
);
const trace = JSON.parse(await readFile(tracePath, "utf8"));
const wasmPath = "node_modules/sql.js/dist/sql-wasm.wasm";

if (!trace.files.some((file) => file.endsWith(wasmPath))) {
  throw new Error(`APKG export trace does not include ${wasmPath}.`);
}
