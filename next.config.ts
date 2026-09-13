import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.NIGHTKEEPER_DESKTOP === "true" ? ".next-desktop" : process.env.NIGHTKEEPER_DEMO === "true" ? ".next-demo" : ".next",
  output: process.env.NIGHTKEEPER_DESKTOP === "true" ? "standalone" : undefined,
  outputFileTracingIncludes: { "/*": ["node_modules/@electric-sql/pglite/dist/**/*"] },
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
};
export default config;
