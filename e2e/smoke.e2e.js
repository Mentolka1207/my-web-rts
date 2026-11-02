// Дымовой тест основного цикла: меню → матч → победа → профиль; и то же под file://
const path = require('node:path');
const { test, expect, openGame, startMatch, state, advanceSim } = require('./fixtures');

for (const [name, url] of [
    ['http', '/index.html'],
    ['file://', 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/')]
]) {
    test(`F01-H1/H2 ${name}: матч идёт, победа пишется в профиль`, async ({ page }) => {
        await openGame(page, url);
        await startMatch(page);
        const s0 = await state(page);
        expect(s0).toMatchObject({ started: true, over: false, allies: 5, enemies: 3, wave: 0 });
        // старт со 100 ⚡; пока тест ждёт, капает доход +5/с — проверяем диапазон, а не точное число
        expect(s0.energy).toBeGreaterThanOrEqual(100);
        expect(s0.energy).toBeLessThanOrEqual(110);
        const t0 = (await state(page)).waveTimer;
        await advanceSim(page, 2);
        expect((await state(page)).waveTimer).toBeLessThan(t0);

        await page.evaluate(() => { enemyHQ.hp = 0; }); // хук: штаб врага разрушен
        await expect(page.getByRole('dialog', { name: /Победа|Victory/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /Играть снова|Play Again/ })).toBeFocused();
        const totals = await page.evaluate(() => JSON.parse(localStorage.getItem('rts_neo_profile_v2')).totals);
        expect(totals).toMatchObject({ matchesPlayed: 1, victories: 1 });
    });
}
