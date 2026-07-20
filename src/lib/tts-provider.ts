/**
 * Server-side TTS adapter.
 *
 * The text-generation provider and the audio provider are intentionally
 * separate. Production uses an OpenAI-compatible speech endpoint and keeps
 * the credential on the server only. APKG audio is always generated as en-US
 * server-side media; browser speech is not an export fallback.
 */

export type TtsConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  locale: "en-US";
  speed: number;
};

export class MissingTtsApiKeyError extends Error {
  constructor() {
    super("SAYDECK_TTS_API_KEY is not configured.");
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
  return Boolean(process.env.SAYDECK_TTS_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

export function getTtsConfig(): TtsConfig {
  const apiKey = process.env.SAYDECK_TTS_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new MissingTtsApiKeyError();
  }

  const speedValue = Number(process.env.SAYDECK_TTS_SPEED ?? "1");

  return {
    apiKey,
    baseUrl: (process.env.SAYDECK_TTS_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.SAYDECK_TTS_MODEL?.trim() || "tts-1",
    voice: process.env.SAYDECK_TTS_VOICE?.trim() || "alloy",
    locale: "en-US",
    speed: Number.isFinite(speedValue) && speedValue > 0 && speedValue <= 4 ? speedValue : 1,
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
    response = await fetch(`${config.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        voice: config.voice,
        locale: config.locale,
        input: normalizedText,
        response_format: "wav",
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

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (!isWav(bytes)) {
    throw new TtsProviderError("invalid_audio", "TTS provider did not return a WAV file.");
  }

  return { bytes, config };
}

function isWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && ascii(bytes, 0, 4) === "RIFF"
    && ascii(bytes, 8, 4) === "WAVE";
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}
