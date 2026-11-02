// playwright.config.js — e2e-тесты Tabhold (npm run e2e).
// Unit-тесты остаются в Vitest (npm test); e2e-файлы названы *.e2e.js, чтобы Vitest их не подхватывал.
const { defineConfig, devices } = require('@playwright/test');

// Под Linux без GPU (CI, контейнеры) WebGL рисуется программно через SwiftShader.
// На Windows/macOS с видеокартой флаги не нужны.
const softwareGL = process.platform === 'linux' ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] : [];

module.exports = defineConfig({
    testDir: './e2e',
    testMatch: '**/*.e2e.js',
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1, // программный WebGL тяжёлый: последовательный прогон стабильнее
    retries: 0,
    reporter: [['list'], ['json', { outputFile: 'e2e/results.json' }]],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        launchOptions: { args: softwareGL },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
        { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, grep: /@mobile/ }
    ],
    webServer: {
        command: 'node e2e/serve.js',
        url: 'http://127.0.0.1:4173/index.html',
        reuseExistingServer: true,
        timeout: 20_000
    }
});
