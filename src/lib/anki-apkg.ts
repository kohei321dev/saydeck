import { readFile } from "node:fs/promises";
import path from "node:path";

import { Deck, Model, Note, Package } from "ankipack";
import initSqlJs from "sql.js";

import { readPrivateBinary } from "@/lib/binary-store";
import type { AnkiExportRecord } from "@/lib/anki-export";

const modelId = 1_785_000_000_001;
const baseDeckId = 1_785_000_000_100;
const ankiDeckHierarchySeparator = "\u001f";

const fieldNames = [
  "Index",
  "Context",
  "Expression",
  "Translation",
  "expression_audio",
] as const;

export class AnkiPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiPackageError";
  }
}

export async function buildAnkiPackage(
  records: AnkiExportRecord[],
): Promise<Uint8Array> {
  if (records.length === 0) {
    throw new AnkiPackageError("No cards were selected for the Anki package.");
  }

  const model = createModel();
  const packageBuilder = new Package();
  const decks = new Map<string, Deck>();
  const addedMedia = new Set<string>();

  for (const record of records) {
    if (!record.media || record.media.length !== 1) {
      throw new AnkiPackageError(`Expression audio is incomplete for ${record.variantId}.`);
    }

    for (const media of record.media) {
      if (addedMedia.has(media.filename)) continue;
      const stored = await readPrivateBinary(media.blobPath);
      packageBuilder.addMedia(media.filename, stored.bytes);
      addedMedia.add(media.filename);
    }

    const deck = decks.get(record.deckName) ?? createDeck(record.deckName);
    deck.addNote(new Note({
      model,
      fields: record.fields.map((field, index) =>
        index === 4 ? field : escapeHtml(field),
      ) as AnkiExportRecord["fields"],
      tags: record.tags,
      guid: record.ankiGuid,
    }));
    decks.set(record.deckName, deck);
  }

  for (const deck of decks.values()) {
    packageBuilder.addDeck(deck);
  }

  const SQL = await initializeSqlJs();
  return packageBuilder.toUint8Array(SQL);
}

function createModel(): Model {
  return new Model({
    id: modelId,
    name: "SayDeck",
    sortFieldIndex: 0,
    fields: fieldNames.map((name, index) => ({
      name,
      plainText: index !== 4,
    })),
    templates: [{
      name: "SayDeck Expression",
      questionFormat: [
        '<div class="context">{{Context}}</div>',
        '<main class="expression">{{Expression}}</main>',
        '<div class="audio">{{expression_audio}}</div>',
      ].join(""),
      answerFormat: [
        '<div class="context">{{Context}}</div>',
        '<main class="translation">{{Translation}}</main>',
      ].join(""),
    }],
    css: [
      ".card {",
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      "  color: #172321;",
      "  background: #f7faf8;",
      "  text-align: left;",
      "  padding: 22px;",
      "}",
      ".context {",
      "  color: #37645b;",
      "  background: #e8f2ef;",
      "  border: 1px solid #c6dad4;",
      "  border-radius: 10px;",
      "  font-size: 13px;",
      "  font-weight: 700;",
      "  line-height: 1.55;",
      "  padding: 10px 12px;",
      "}",
      ".expression, .translation {",
      "  font-size: 27px;",
      "  font-weight: 700;",
      "  line-height: 1.5;",
      "  margin: 30px 2px 22px;",
      "}",
      ".translation { font-size: 23px; }",
      ".audio { margin-top: 20px; }",
      ".replay-button svg { width: 36px; height: 36px; }",
    ].join("\n"),
  });
}

function createDeck(name: string): Deck {
  return new Deck({
    id: stableDeckId(name),
    // Modern Anki stores deck hierarchy segments with U+001F internally.
    // ankipack writes names to SQLite verbatim, so passing the UI-facing
    // `::` separator creates a flat deck whose literal name contains `::`.
    name: name.replaceAll("::", ankiDeckHierarchySeparator),
    config: null,
  });
}

function stableDeckId(name: string): number {
  let hash = 0;
  for (const character of name) {
    hash = ((hash << 5) - hash + character.codePointAt(0)!) | 0;
  }
  return baseDeckId + Math.abs(hash % 900_000_000);
}

async function initializeSqlJs() {
  const wasmPath = path.join(
    process.cwd(),
    "node_modules",
    "sql.js",
    "dist",
    "sql-wasm.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  const wasmBinary = wasmBytes.buffer.slice(
    wasmBytes.byteOffset,
    wasmBytes.byteOffset + wasmBytes.byteLength,
  ) as ArrayBuffer;
  return initSqlJs({ wasmBinary });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replace(/\r?\n/g, "<br>");
}
