import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const isCi = !!process.env.CI;

const config: PlaywrightTestConfig = {
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run preview",
    port: 4173,
    reuseExistingServer: !isCi,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
};

if (isCi) {
  config.workers = 1;
}

export default defineConfig(config);
