import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/anki-exports": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  // Discord's HTTP adapter also exposes optional Gateway compression imports.
  // Keep the Node-only adapter external so Next.js does not try to bundle the
  // optional native zlib-sync package that this webhook-only MVP never uses.
  serverExternalPackages: ["sql.js", "@chat-adapter/discord"],
};

export default nextConfig;
