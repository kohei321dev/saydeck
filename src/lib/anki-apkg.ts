import { readFile } from "node:fs/promises";
import path from "node:path";

import initSqlJs from "sql.js";
import { Deck, Model, Note, Package } from "ankipack";

import { readPrivateBinary } from "@/lib/binary-store";
import type { AnkiExportRecord } from "@/lib/anki-export";

const modelId = 1_740_000_000_001;
const baseDeckId = 1_740_000_000_100;

const fieldNames = [
  "Index",
  "Word",
  "Definition",
  "Irregular Forms",
  "Example Sentence",
  "Translation",
  "word_audio",
  "sentence_audio",
] as const;

export class AnkiPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiPackageError";
  }
}

export async function buildAnkiPackage(records: AnkiExportRecord[]): Promise<Uint8Array> {
  if (records.length === 0) {
    throw new AnkiPackageError("No cards were selected for the Anki package.");
  }

  const model = createModel();
  const packageBuilder = new Package();
  const decks = new Map<string, Deck>();
  const addedMedia = new Set<string>();

  for (const record of records) {
    if (!record.media || record.media.length !== 2) {
      throw new AnkiPackageError(`Audio media is incomplete for ${record.variantId}.`);
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
      fields: record.fields.map((field, index) => index >= 6 ? field : escapeHtml(field)) as AnkiExportRecord["fields"],
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
    name: "SayDeck ES1Kv2",
    sortFieldIndex: 0,
    fields: fieldNames.map((name, index) => ({
      name,
      plainText: index !== 6 && index !== 7,
    })),
    templates: [{
      name: "ES1K Vocab",
      questionFormat: "{{Word}}<br>{{word_audio}}",
      answerFormat: "{{FrontSide}}<hr id=\"answer\">{{Word}}<br>{{Definition}}<br>{{Irregular Forms}}<br>{{Example Sentence}}<br>{{Translation}}<br>{{sentence_audio}}",
    }],
    css: ".card { font-family: arial; font-size: 20px; text-align: left; color: black; background-color: white; }",
  });
}

function createDeck(name: string): Deck {
  return new Deck({
    id: stableDeckId(name),
    name,
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
  const wasmPath = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
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
