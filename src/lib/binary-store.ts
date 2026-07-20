import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { get, put } from "@vercel/blob";

export type StoredBinary = {
  blobPath: string;
  size: number;
  contentType: string;
};

export class BinaryStorageUnavailableError extends Error {
  constructor() {
    super("Private binary storage is not configured.");
    this.name = "BinaryStorageUnavailableError";
  }
}

export class BinaryNotFoundError extends Error {
  constructor() {
    super("Stored binary was not found.");
    this.name = "BinaryNotFoundError";
  }
}

const localPrefix = "local:";
const blobPrefix = "blob:";

export function isBlobStorageConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim()
      || (process.env.VERCEL_OIDC_TOKEN?.trim() && process.env.BLOB_STORE_ID?.trim()),
  );
}

export function isLocalBinaryStorageAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function putPrivateBinary(
  pathname: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<StoredBinary> {
  const safePath = normalizePathname(pathname);

  if (isBlobStorageConfigured()) {
    const result = await put(safePath, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });

    return {
      blobPath: `${blobPrefix}${result.pathname}`,
      size: bytes.byteLength,
      contentType,
    };
  }

  if (!isLocalBinaryStorageAllowed()) {
    throw new BinaryStorageUnavailableError();
  }

  const root = localStorageRoot();
  const absolutePath = path.join(root, safePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);

  return {
    blobPath: `${localPrefix}${safePath}`,
    size: bytes.byteLength,
    contentType,
  };
}

export async function readPrivateBinary(blobPath: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  if (blobPath.startsWith(blobPrefix)) {
    const result = await get(blobPath.slice(blobPrefix.length), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) {
      throw new BinaryNotFoundError();
    }

    return {
      bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()),
      contentType: result.blob.contentType,
    };
  }

  if (blobPath.startsWith(localPrefix)) {
    if (!isLocalBinaryStorageAllowed()) {
      throw new BinaryStorageUnavailableError();
    }

    const bytes = new Uint8Array(await readFile(path.join(localStorageRoot(), normalizePathname(blobPath.slice(localPrefix.length)))));
    return { bytes, contentType: contentTypeForPath(blobPath) };
  }

  throw new BinaryNotFoundError();
}

export async function readPrivateBinaryStream(blobPath: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  contentType: string;
}> {
  if (blobPath.startsWith(blobPrefix)) {
    const result = await get(blobPath.slice(blobPrefix.length), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) {
      throw new BinaryNotFoundError();
    }

    return { stream: result.stream, contentType: result.blob.contentType };
  }

  const stored = await readPrivateBinary(blobPath);
  return {
    stream: new Response(Buffer.from(stored.bytes)).body as ReadableStream<Uint8Array>,
    contentType: stored.contentType,
  };
}

function localStorageRoot(): string {
  return process.env.SAYDECK_LOCAL_STORAGE_DIR?.trim() || path.join(process.cwd(), ".saydeck-storage");
}

function normalizePathname(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid binary storage pathname.");
  }
  return normalized;
}

function contentTypeForPath(value: string): string {
  return value.endsWith(".apkg") ? "application/vnd.anki" : "audio/wav";
}
