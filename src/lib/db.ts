import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | undefined;

/**
 * Determines whether a PostgreSQL database URL is configured via the `DATABASE_URL` environment variable.
 *
 * @returns `true` if `process.env.DATABASE_URL` is set and non-empty, `false` otherwise.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Create or return a singleton PostgreSQL client configured using the `DATABASE_URL` environment variable.
 *
 * @returns The initialized `postgres` client instance.
 * @throws Error if `DATABASE_URL` is not configured.
 */
export function getSql() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  sqlClient ??= postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
  });

  return sqlClient;
}
