// e2e/fixtures.js — общие фикстуры и хелперы e2e-тестов.
// Каждый тест:
//  - падает при ошибке в консоли, необработанном исключении на странице и ответе >= 400 на свой файл;
//  - стартует с чистым профилем (обучение пройдено), если тест не просит иного;
//  - может сделать axe-скан (WCAG 2.2 AA) хелпером a11y().
const base = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

const LANG_RU = /Играть|Play/;

const test = base.test.extend({
    // Профиль по умолчанию: обучение пройдено, язык ru. Переопределяется в test.use({ profile: ... }).
    profile: [{ schema: 2, tutorialCompleted: true }, { option: true }],
    settings: [{ schema: 2, language: 'ru' }, { option: true }],
    // Список «разрешённых» сообщений консоли (регулярные выражения) — по умолчанию пуст.
    allowConsole: [[], { option: true }],

    page: async ({ page, profile, settings, allowConsole }, use, testInfo) => {
        const problems = [];
        page.on('console', msg => {
            if (msg.type() !== 'error') return;
            const text = msg.text();
            if (allowConsole.some(re => re.test(text))) return;
            problems.push(`console.error: ${text}`);
        });
        page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
        page.on('response', res => {
            if (res.status() >= 400 && res.url().startsWith(testInfo.project.use.baseURL || 'http://127.0.0.1:4173')) {
                problems.push(`${res.status()} ${res.url()}`);
            }
        });
        await page.addInitScript(([p, s]) => {
            try {
                if (!sessionStorage.getItem('__e2e_seeded')) {
                    if (p) localStorage.setItem('rts_neo_profile_v2', JSON.stringify(p));
                    if (s) localStorage.setItem('rts_neo_settings_v2', JSON.stringify(s));
                    sessionStorage.setItem('__e2e_seeded', '1');
                }
            } catch (e) { /* хранилище может быть недоступно — это отдельный тест */ }
        }, [profile, settings]);

        await use(page);

        if (problems.length) {
            throw new Error('Проблемы на странице во время теста:\n' + problems.join('\n'));
        }
    }
});

// Открыть игру и дождаться готовности сцены и меню
async function openGame(page, url = '/index.html') {
    await page.goto(url);
    await base.expect(page.getByRole('button', { name: LANG_RU })).toBeVisible();
    await page.waitForFunction(() => typeof startGame === 'function' && typeof renderer !== 'undefined', null, { polling: 200 });
}

// Начать матч кнопкой «Играть» (как игрок).
// polling по таймеру, а не по кадрам: в неактивной вкладке requestAnimationFrame не вызывается.
async function startMatch(page) {
    await page.getByRole('button', { name: LANG_RU }).click();
    await page.waitForFunction(() => gameStarted === true && units.length > 0, null, { polling: 200 });
}

// Снимок состояния игры для проверок
function state(page) {
    return page.evaluate(() => ({
        started: gameStarted, over: gameOver, paused: isGamePaused,
        simPaused: typeof isSimulationPaused === 'function' ? isSimulationPaused() : isGamePaused,
        modal: typeof topModalId === 'function' ? topModalId() : null,
        energy: Math.floor(energy),
        allies: units.filter(u => u.hp > 0).length,
        enemies: enemies.filter(u => u.hp > 0).length,
        wave: waveNumber, waveTimer,
        simTime: typeof simElapsedTime !== 'undefined' ? simElapsedTime : null
    }));
}

// axe WCAG 2.2 AA. meta-viewport исключён осознанно: щипок на поле — зум камеры (build-log.md).
async function a11y(page) {
    const res = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .disableRules(['meta-viewport'])
        .analyze();
    return res.violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
}

// Ждать, пока симуляция продвинется на dt секунд игрового времени (а не реального)
async function advanceSim(page, dt, timeout = 60_000) {
    const start = await page.evaluate(() => simElapsedTime);
    await page.waitForFunction(([s, d]) => simElapsedTime >= s + d, [start, dt], { timeout });
}

// Точка мира (x, z) → координаты на экране (CSS px) через камеру игры
function worldToScreen(page, x, z) {
    return page.evaluate(([wx, wz]) => {
        const v = new THREE.Vector3(wx, 0, wz).project(camera);
        return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, onScreen: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
    }, [x, z]);
}

// Приказ ПКМ настоящей мышью по точке мира
async function rightClickWorld(page, x, z) {
    const p = await worldToScreen(page, x, z);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    return p;
}

// Свободная клетка поля, видимая на экране, далеко от союзников (для приказа движения)
function pickVisibleFreeCell(page) {
    return page.evaluate(() => {
        const cx = units.reduce((a, u) => a + u.mesh.position.x, 0) / units.length;
        const cz = units.reduce((a, u) => a + u.mesh.position.z, 0) / units.length;
        let best = null;
        for (let r = 1; r < GRID_SIZE - 1; r++) for (let c = 1; c < GRID_SIZE - 1; c++) {
            if (grid[r][c] !== 0) continue;
            const w = gridToWorld(c, r);
            const v = new THREE.Vector3(w.x, 0, w.z).project(camera);
            if (Math.abs(v.x) > 0.6 || Math.abs(v.y) > 0.6) continue; // подальше от панелей HUD
            const d = Math.hypot(w.x - cx, w.z - cz);
            if (!best || d > best.d) best = { c, r, x: w.x, z: w.z, d };
        }
        return best;
    });
}

// Перемотка симуляции на dt игровых секунд тестовым хуком: тот же шаг, что делает animate(), но без ожидания
// кадров (программный WebGL рисует единицы кадров в секунду, бой на минуту шёл бы четверть часа).
function fastForward(page, dt) {
    return page.evaluate((sec) => {
        const ticks = Math.round(sec * 30);
        for (let i = 0; i < ticks && !gameOver; i++) {
            stepSimulation(1 / 30, simElapsedTime);
            simElapsedTime += 1 / 30;
        }
    }, dt);
}

// Приказ ПКМ выделенным юнитам в точку мира (x, z): камера наводится на точку, клик — в центр экрана
function orderSelectedTo(page, x, z, y = 0) {
    return page.evaluate(([wx, wz, wy]) => {
        camPivot.set(wx, 0, wz);
        applyCameraTransform();
        camera.updateMatrixWorld(true);
        const v = new THREE.Vector3(wx, wy, wz).project(camera);
        issueMoveOrderAtPoint((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight);
    }, [x, z, y]);
}

// Тихое поле боя: волны отложены, стартовые враги убраны
function clearBattlefield(page) {
    return page.evaluate(() => {
        waveTimer = 99999;
        enemies.forEach(e => { e.hp = 0; });
        stepSimulation(1 / 30, simElapsedTime);
    });
}

// Центр свободной клетки рядом с точкой мира
function freeSpotNear(page, x, z) {
    return page.evaluate(([wx, wz]) => {
        const g = worldToGrid(wx, wz);
        const c = findFreeCellNear(g.col, g.row);
        return gridToWorld(c.col, c.row);
    }, [x, z]);
}

module.exports = {
    test, expect: base.expect, openGame, startMatch, state, a11y, advanceSim, worldToScreen, rightClickWorld,
    pickVisibleFreeCell, fastForward, orderSelectedTo, clearBattlefield, freeSpotNear, LANG_RU
};
