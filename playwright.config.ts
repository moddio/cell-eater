import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60000,
    use: {
        headless: false,
        viewport: { width: 1280, height: 720 },
    },
});
