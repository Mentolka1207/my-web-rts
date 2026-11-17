// playwright.config.js — e2e-тесты Tabhold (npm run e2e).
// Unit-тесты остаются в Vitest (npm test); e2e-файлы названы *.e2e.js, чтобы Vitest их не подхватывал.
const { defineConfig, devices } = require('@playwright/test');

// Под Linux без GPU (CI, контейнеры) WebGL рисуется программно через SwiftShader.
// На Windows/macOS с видеокартой флаги не нужны. Флаги только для Chromium:
// WebKit/Firefox их не понимают, поэтому launchOptions задаются в chromium-проектах.
const softwareGL = process.platform === 'linux' ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] : [];
const chromiumLaunch = { launchOptions: { args: softwareGL } };

module.exports = defineConfig({
    testDir: './e2e',
    testMatch: '**/*.e2e.js',
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1, // программный WebGL тяжёлый: последовательный прогон стабильнее
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI
        ? [['list'], ['json', { outputFile: 'e2e/results.json' }], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
        : [['list'], ['json', { outputFile: 'e2e/results.json' }]],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'desktop',
            grepInvert: /@mobile/,
            use: { ...devices['Desktop Chrome'], ...chromiumLaunch, viewport: { width: 1440, height: 900 } }
        },
        {
            name: 'webkit',
            grepInvert: /@mobile/,
            use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }
        },
        {
            name: 'mobile',
            use: { ...devices['Pixel 7'], ...chromiumLaunch, viewport: { width: 390, height: 844 } },
            grep: /@mobile/
        },
        {
            name: 'webkit-mobile',
            use: { ...devices['iPhone 13'] },
            grep: /@mobile/
        }
    ],
    webServer: {
        command: 'node e2e/serve.js',
        url: 'http://127.0.0.1:4173/index.html',
        reuseExistingServer: !process.env.CI,
        timeout: 20_000
    }
});
