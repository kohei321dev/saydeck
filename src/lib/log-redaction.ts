const redacted = "[redacted]";
const maxDepth = 4;
const maxArrayItems = 8;
const maxObjectKeys = 20;

const sensitiveKeyPattern =
  /authorization|cookie|credential|database_url|password|secret|token|api[_-]?key|client[_-]?secret/i;
const secretLikeStringPattern =
  /(bearer\s+[a-z0-9._~+/-]+={0,2}|gh[opsu]_[a-z0-9_]+|sk-[a-z0-9_-]+|xox[baprs]-[a-z0-9-]+)/i;
const authenticatedUrlPattern = /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i;

type RedactedLogValue =
  | null
  | boolean
  | number
  | string
  | RedactedLogValue[]
  | { [key: string]: RedactedLogValue };

export function logServerError(
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const payload: Record<string, RedactedLogValue> = {
    error: redactLogValue(error),
  };

  if (context) {
    payload.context = redactLogValue(context);
  }

  console.error(message, payload);
}

export function redactLogValue(value: unknown, depth = 0): RedactedLogValue {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "undefined") {
    return "[undefined]";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return `[${typeof value}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (depth >= maxDepth) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, maxArrayItems)
      .map((item) => redactLogValue(item, depth + 1));
  }

  const output: Record<string, RedactedLogValue> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(
    0,
    maxObjectKeys,
  );

  for (const [key, item] of entries) {
    output[key] = sensitiveKeyPattern.test(key)
      ? redacted
      : redactLogValue(item, depth + 1);
  }

  return output;
}

function redactString(value: string): string {
  if (authenticatedUrlPattern.test(value) || secretLikeStringPattern.test(value)) {
    return redacted;
  }

  return value;
}
