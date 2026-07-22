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
const routePath = path.join(
  process.cwd(),
  ".next",
  "server",
  "app",
  "api",
  "anki-exports",
  "route.js",
);
const trace = JSON.parse(await readFile(tracePath, "utf8"));
const wasmPath = "node_modules/sql.js/dist/sql-wasm.wasm";
const route = await readFile(routePath, "utf8");

if (!trace.files.some((file) => file.replaceAll("\\", "/").endsWith(wasmPath))) {
  throw new Error(`APKG export trace does not include ${wasmPath}.`);
}

if (!route.includes('require("sql.js")')) {
  throw new Error("APKG export bundles sql.js instead of using Node.js require.");
}
