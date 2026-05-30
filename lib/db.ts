import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

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

