/**
 * Server-side TTS adapter.
 *
 * Text generation and audio synthesis remain separate server-side paths.
 * Production uses xAI Text to Speech with the same server-only
 * credential as expression generation. APKG audio is always generated as
 * en-US server-side media; browser speech is not an export fallback.
 */

export type TtsConfig = {
  apiKey: string;
  baseUrl: string;
  provider: "xai";
  model: string;
  voice: string;
  locale: "en-US";
  language: "en";
  speed: number;
};

export class MissingTtsApiKeyError extends Error {
  constructor() {
    super("OWNER_AI_KEY is not configured.");
    this.name = "MissingTtsApiKeyError";
  }
}

export class TtsProviderError extends Error {
  readonly code: "unavailable" | "invalid_audio" | "quota_exceeded";
  readonly status: number;

  constructor(
    code: TtsProviderError["code"],
    message: string,
    status = 502,
  ) {
    super(message);
    this.name = "TtsProviderError";
    this.code = code;
    this.status = status;
  }
}

export function isTtsConfigured(): boolean {
  return Boolean(process.env.OWNER_AI_KEY?.trim());
}

export function getTtsConfig(): TtsConfig {
  const apiKey = process.env.OWNER_AI_KEY?.trim();

  if (!apiKey) {
    throw new MissingTtsApiKeyError();
  }

  const speedValue = Number(process.env.SAYDECK_TTS_SPEED ?? "1");

  return {
    apiKey,
    baseUrl: "https://api.x.ai/v1",
    provider: "xai",
    model: "xai-tts",
    voice: process.env.SAYDECK_TTS_VOICE?.trim() || "eve",
    locale: "en-US",
    language: "en",
    speed: Number.isFinite(speedValue) && speedValue >= 0.7 && speedValue <= 1.5 ? speedValue : 1,
  };
}

export async function synthesizeAmericanEnglish(text: string): Promise<{
  bytes: Uint8Array;
  config: TtsConfig;
}> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new TtsProviderError("invalid_audio", "TTS input is empty.", 400);
  }

  if (normalizedText.length > 4096) {
    throw new TtsProviderError("invalid_audio", "TTS input is too long.", 400);
  }

  const config = getTtsConfig();
  let response: Response;

  try {
    response = await fetch(`${config.baseUrl}/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: normalizedText,
        voice_id: config.voice,
        language: config.language,
        output_format: {
          codec: "wav",
          sample_rate: 24_000,
        },
        speed: config.speed,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new TtsProviderError(
      "unavailable",
      error instanceof Error ? error.message : "TTS provider request failed.",
    );
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "TTS provider request failed.");
    const quota = response.status === 402 || response.status === 429 || /quota|credit|rate.?limit/i.test(message);
    throw new TtsProviderError(
      quota ? "quota_exceeded" : "unavailable",
      quota ? "TTS provider quota or rate limit was reached." : `TTS provider request failed (${response.status}).`,
      quota ? 429 : 502,
    );
  }

  const bytes = await readAudioBytes(response);

  if (!isWav(bytes)) {
    throw new TtsProviderError("invalid_audio", "TTS provider did not return a WAV file.");
  }

  return { bytes, config };
}

async function readAudioBytes(response: Response): Promise<Uint8Array> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const body = (await response.json().catch(() => null)) as { audio?: unknown } | null;
  if (!body || typeof body.audio !== "string") {
    throw new TtsProviderError("invalid_audio", "xAI TTS did not return audio bytes.");
  }

  return new Uint8Array(Buffer.from(body.audio, "base64"));
}

function isWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && ascii(bytes, 0, 4) === "RIFF"
    && ascii(bytes, 8, 4) === "WAVE";
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}
