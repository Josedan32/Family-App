import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Both projects share one dev-mode server and one Postgres database, with
  // no fixture isolation between tests — running them concurrently produces
  // real cross-test interference (a household join racing another test's
  // in-flight request), not just slowness.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
