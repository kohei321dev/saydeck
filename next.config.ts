import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/anki-exports": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
