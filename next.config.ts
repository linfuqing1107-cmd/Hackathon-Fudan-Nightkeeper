import type { NextConfig } from "next";
const config: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
};
export default config;
