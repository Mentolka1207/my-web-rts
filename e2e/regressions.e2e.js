// Регрессионные тесты: по одному на каждый баг из bugs.md. Сначала падали, потом исправлены.
const { test, expect, openGame, startMatch } = require('./fixtures');

// BUG-001 (две вкладки) проверяется в tests/storage.test.js: две «вкладки» над общим localStorage.
// В браузере две вкладки с программным WebGL перегружают тестовую машину и дают ложные таймауты.

test.describe('BUG-002 язык в профайлере и FPS-панели', () => {
    for (const lang of ['ru', 'en']) {
        test.describe(lang, () => {
            test.use({ settings: { schema: 2, language: lang } });
            test(`подписи потоков без чужого языка (${lang})`, async ({ page }) => {
                await openGame(page);
                await startMatch(page);
                await page.evaluate(() => { toggleDebugOverlay(); togglePerfPanel(); });
                await page.waitForFunction(() => document.getElementById('dbg-threads').textContent !== '--'
                    && document.getElementById('perf-threads').textContent !== '1');
                const texts = await page.evaluate(() => ['dbg-threads', 'dbg-sim-mode', 'perf-threads'].map(id => document.getElementById(id).textContent));
                const foreign = lang === 'en' ? /[А-Яа-яЁё]/ : /\b(Main Thread|Multi-Core|cores?)\b/i;
                expect(texts.filter(s => foreign.test(s))).toEqual([]);
            });
        });
    }
});

test('BUG-003 пустой сид: поле показывает сид, который реально используется', async ({ page }) => {
    await openGame(page);
    const input = page.getByRole('textbox', { name: /Сид|Seed/ });
    await input.fill('12345');
    await input.press('Enter');
    for (const v of ['', '   ']) {
        await input.fill(v);
        await input.press('Enter'); // как игрок: стёр и нажал Enter
        await input.blur();
        await expect(input).toHaveValue(String(await page.evaluate(() => getMapSeed())));
    }
});

test('BUG-004 @mobile поле сида на таче не ниже 44 px', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'только для проекта mobile');
    await openGame(page);
    const box = await page.getByRole('textbox', { name: /Сид|Seed/ }).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
});
