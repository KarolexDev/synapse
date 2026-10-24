import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  timeout: 90_000,
  use: { baseURL: 'http://localhost:5173' },
  webServer: { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15 Pro'], browserName: 'chromium', viewport: { width: 393, height: 852 } } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
})
