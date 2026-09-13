import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
