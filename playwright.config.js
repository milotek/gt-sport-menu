import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 60000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:4173",
    launchOptions: { executablePath: process.env.CHROME_PATH || "/etc/profiles/per-user/milotek/bin/google-chrome" },
    viewport: { width: 1920, height: 1080 },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory site", url: "http://127.0.0.1:4173", reuseExistingServer: true, stdout: "ignore", stderr: "ignore" },
});
