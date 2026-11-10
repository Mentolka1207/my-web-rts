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

// ---------------------------------------------------------------------------
// BUG-005 … BUG-020: аудит 2026-11-10 (bugs.md). Бой перематывается хуком fastForward.
// ---------------------------------------------------------------------------
const { fastForward, orderSelectedTo, clearBattlefield, freeSpotNear, state } = require('./fixtures');

test.describe('BUG-005 обычный матч считает полный FSM, а не упрощённая симуляция воркеров', () => {
    test('стартовый отряд остаётся у базы, состояния — строки FSM', async ({ page }) => {
        await openGame(page);
        await startMatch(page);
        const base = await page.evaluate(() => gridToWorld(BASE_COL, BASE_ROW));
        await page.waitForTimeout(1500); // реальные кадры: сюда попадал шаг воркеров
        const res = await page.evaluate(() => units.map(u => ({ x: u.mesh.position.x, z: u.mesh.position.z, state: u.state })));
        for (const u of res) {
            expect(Math.hypot(u.x - base.x, u.z - base.z)).toBeLessThan(12);
            expect(['IDLE', 'MOVE', 'CHASE', 'ATTACK']).toContain(u.state);
        }
    });

    test('волна появляется у вражеского штаба и идёт к штабу игрока', async ({ page }) => {
        await openGame(page);
        await startMatch(page);
        await page.evaluate(() => { waveTimer = 0.1; });
        await fastForward(page, 1);
        const dist = () => page.evaluate(() => {
            const hq = playerHQ.mesh.position;
            return enemies.filter(e => e.isWaveUnit).map(e => Math.hypot(e.mesh.position.x - hq.x, e.mesh.position.z - hq.z));
        });
        const d0 = await dist();
        expect(d0.length).toBeGreaterThan(0);
        const enemyHqDist = await page.evaluate(() => playerHQ.mesh.position.distanceTo(enemyHQ.mesh.position));
        for (const d of d0) expect(d).toBeGreaterThan(enemyHqDist * 0.8); // спавн у своего штаба, а не в центре карты
        await fastForward(page, 20);
        const d1 = await dist();
        expect(Math.min(...d1)).toBeLessThan(Math.min(...d0) - 40);
    });

    test('пул воркеров знает размер текущей карты', async ({ page }) => {
        await openGame(page);
        const sizes = await page.evaluate(() => ({ pool: simWorkerPool.worldSize, map: MAP_WORLD_SIZE, poolCell: simWorkerPool.cellSize, cell: CELL_SIZE }));
        expect(sizes.pool).toBe(sizes.map);
        expect(sizes.poolCell).toBe(sizes.cell);
    });
});

test('BUG-006 юниты и кольца выделения не отсекаются по устаревшей bounding sphere', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    const culled = await page.evaluate(() => [
        instancedRenderer.allyDroneMesh, instancedRenderer.enemyDroneMesh, instancedRenderer.allyScoutMesh,
        instancedRenderer.enemyScoutMesh, instancedRenderer.allyTankMesh, instancedRenderer.enemyTankMesh,
        instancedRenderer.selectionRingsMesh
    ].map(m => m.frustumCulled));
    expect(culled).toEqual(Array(7).fill(false));
});

test('BUG-007 приказ второй группе не уводит первую к чужой цели', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    await page.evaluate(() => { energy = 5000; for (let i = 0; i < 5; i++) produceUnit('standard'); });
    const a = await freeSpotNear(page, 40, -60);
    const b = await freeSpotNear(page, -60, 40);
    await page.evaluate(() => units.forEach((u, i) => { u.selected = i < 5; }));
    await orderSelectedTo(page, a.x, a.z);
    await fastForward(page, 2);
    await page.evaluate(() => units.forEach((u, i) => { u.selected = i >= 5; }));
    await orderSelectedTo(page, b.x, b.z);
    await fastForward(page, 50);
    const res = await page.evaluate(([a, b]) => ({
        distA: units.slice(0, 5).map(u => Math.hypot(u.mesh.position.x - a.x, u.mesh.position.z - a.z)),
        distB: units.slice(5).map(u => Math.hypot(u.mesh.position.x - b.x, u.mesh.position.z - b.z)),
        states: units.map(u => u.state)
    }), [a, b]);
    for (const d of res.distA) expect(d).toBeLessThan(8);
    for (const d of res.distB) expect(d).toBeLessThan(8);
    expect(res.states.every(s => s === 'IDLE')).toBe(true);
});

test('BUG-008 длинная шеренга доходит до мест, никто не застревает в MOVE', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    await page.evaluate(() => { energy = 5000; for (let i = 0; i < 11; i++) produceUnit(i % 3 === 0 ? 'scout' : 'standard'); setFormation('line'); units.forEach(u => { u.selected = true; }); });
    const p = await freeSpotNear(page, -40, -40);
    await orderSelectedTo(page, p.x, p.z);
    await fastForward(page, 45);
    const states = await page.evaluate(() => units.map(u => u.state));
    expect(states.length).toBe(16);
    expect(states.filter(s => s !== 'IDLE')).toEqual([]);
});

test('BUG-009 фокус-атака штаба с другого конца карты не сбрасывается', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    await page.evaluate(() => units.forEach(u => { u.selected = true; }));
    const hq = await page.evaluate(() => ({ x: enemyHQ.mesh.position.x, z: enemyHQ.mesh.position.z, hp: enemyHQ.hp }));
    await orderSelectedTo(page, hq.x, hq.z, 1.0);
    await fastForward(page, 1);
    expect(await page.evaluate(() => units.every(u => u.state === 'CHASE' && u.targetEnemy === enemyHQ))).toBe(true);
    await fastForward(page, 90);
    expect(await page.evaluate(() => enemyHQ.hp)).toBeLessThan(hq.hp);
});

test('BUG-010 юнит не входит в стену: коллизия совпадает с видимым монолитом', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    const res = await page.evaluate(() => {
        let cell = null;
        for (let r = 5; r < GRID_SIZE - 5 && !cell; r++) for (let c = 5; c < GRID_SIZE - 5; c++) {
            if (grid[r][c] === 1 && grid[r][c - 1] === 0 && grid[r][c - 2] === 0) { cell = { c, r }; break; }
        }
        const wall = gridToWorld(cell.c, cell.r);
        const from = gridToWorld(cell.c - 2, cell.r);
        const u = units[0];
        u.mesh.position.set(from.x, 0.75, from.z);
        u.personalTarget = new THREE.Vector3(wall.x, 0.75, wall.z); // цель внутри стены: юнит упирается в грань
        u.state = States.MOVE; u.flowField = null; u.finalApproach = true; u.approachTime = 0; u.approachLimit = 999;
        return { face: wall.x - CELL_SIZE * 0.98 / 2, radius: u.radius };
    });
    await fastForward(page, 6);
    const edge = await page.evaluate(() => units[0].mesh.position.x + units[0].radius);
    expect(edge).toBeLessThanOrEqual(res.face + 0.05);
});

test('BUG-011 танк в осаде стреляет на удвоенную дальность', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    const hp0 = await page.evaluate(() => {
        energy = 1000; produceUnit('tank');
        const tank = units[units.length - 1];
        units.forEach(u => { if (u !== tank) u.hp = 0; });
        toggleTankSiege(tank, getGameTime());
        const p = tank.mesh.position;
        createEnemy(p.x + 7.6, p.z, 'tank'); // дальше обычного обзора танка (7), ближе осадной дальности (8)
        const e = enemies[enemies.length - 1];
        e.speed = 0; e.damage = 0; e.visionRange = 0;
        return e.hp;
    });
    await fastForward(page, 6);
    expect(await page.evaluate(() => enemies[enemies.length - 1].hp)).toBeLessThan(hp0);
});

test.describe('BUG-012 стресс-тест не ломает матч', () => {
    test('после остановки штабы целы, итог боя не срабатывает и не пишется в профиль', async ({ page }) => {
        await openGame(page);
        await startMatch(page);
        await page.evaluate(() => { runBenchmark(100); playerHQ.hp = 0; enemyHQ.hp = 20; stopBenchmark(); });
        await page.waitForTimeout(1200);
        const s = await page.evaluate(() => ({ over: gameOver, php: playerHQ.hp, pmax: playerHQ.maxHp, ehp: enemyHQ.hp, emax: enemyHQ.maxHp }));
        expect(s).toEqual({ over: false, php: s.pmax, pmax: s.pmax, ehp: s.emax, emax: s.emax });
        const totals = await page.evaluate(() => (JSON.parse(localStorage.getItem('rts_neo_profile_v2')).totals || {}).matchesPlayed || 0);
        expect(totals).toBe(0);
    });

    test('рестарт во время теста возвращает обычный матч', async ({ page }) => {
        await openGame(page);
        await startMatch(page);
        await page.evaluate(() => { runBenchmark(100); restartMatch(); });
        await page.waitForTimeout(1200);
        const s = await page.evaluate(() => ({ bench: benchmarkActive, states: units.map(u => u.state) }));
        expect(s.bench).toBe(false);
        expect(await state(page)).toMatchObject({ started: true, over: false, allies: 5, enemies: 3 });
        expect(s.states.every(v => typeof v === 'string')).toBe(true);
    });
});

test('BUG-013 громкость 0 сохраняется и показывается как 0%', async ({ page }) => {
    await openGame(page);
    await page.getByRole('button', { name: /Настройки|Settings/ }).click();
    await page.evaluate(() => { const s = document.getElementById('slider-master-vol'); s.value = 0; s.dispatchEvent(new Event('input')); });
    await page.getByRole('button', { name: /Сохранить и закрыть|Save/ }).click();
    await page.getByRole('button', { name: /Настройки|Settings/ }).click();
    expect(await page.evaluate(() => document.getElementById('slider-master-vol').value)).toBe('0');
    await page.getByRole('button', { name: /Сохранить и закрыть|Save/ }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rts_neo_settings_v2')).masterVolume)).toBe(0);
});

test('BUG-014 набор сида буквами не спавнит врагов и не меняет строй', async ({ page }) => {
    await openGame(page);
    const before = await page.evaluate(() => ({ enemies: enemies.length, formation: currentFormation }));
    const input = page.getByRole('textbox', { name: /Сид|Seed/ });
    await input.fill('');
    await input.pressSequentially('ggxc');
    await input.press('ArrowLeft');
    expect(await page.evaluate(() => ({ enemies: enemies.length, formation: currentFormation }))).toEqual(before);
    expect(await page.evaluate(() => !!keys['ArrowLeft'])).toBe(false);
    await input.blur();
    await page.keyboard.press('g'); // в меню игровые клавиши не действуют
    expect(await page.evaluate(() => enemies.length)).toBe(before.enemies);
});

test('BUG-015 новое оповещение не гаснет вместе с предыдущим', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await page.evaluate(() => showTacticalAlert('first', false));
    await page.waitForTimeout(4650); // первое оповещение начало гаснуть (4500 мс + 400 мс затухания)
    await page.evaluate(() => showTacticalAlert('second', false));
    await page.waitForTimeout(700);
    await expect(page.locator('#tactical-alert')).toBeVisible();
    await expect(page.locator('#tactical-alert')).toHaveText('second');
});

test('BUG-016 таймер способности на панели идёт сам, без клика по юниту', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    await page.evaluate(() => {
        energy = 500; produceUnit('scout');
        units.forEach(u => { u.selected = u.type === 'scout'; });
        updateAbilityUI();
        triggerAbilityForSelected('overdrive');
    });
    const status = page.locator('#status-ability-overdrive');
    await expect(status).toHaveText(/\d\.\dс/); // «с» — из словаря (SEC_SHORT), язык теста — русский
    const first = await status.textContent();
    await expect(status).not.toHaveText(first, { timeout: 20_000 });
});

test('BUG-017 патрульный враг после потери цели возвращается к патрулю', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    await page.evaluate(() => {
        createEnemy(60, 60, 'standard');
        const e = enemies[enemies.length - 1];
        e.state = States.MOVE; e.roamTarget = null; // так выглядит патрульный после сорванной погони
    });
    await fastForward(page, 30);
    const moved = await page.evaluate(() => { const e = enemies[enemies.length - 1]; return Math.hypot(e.mesh.position.x - 60, e.mesh.position.z - 60); });
    expect(moved).toBeGreaterThan(1);
});

test('BUG-018 потеря фокуса окном отпускает клавиши камеры', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await page.keyboard.down('KeyD');
    expect(await page.evaluate(() => !!keys['KeyD'])).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await page.evaluate(() => !!keys['KeyD'])).toBe(false);
    await page.keyboard.up('KeyD');
});

test('BUG-019 пробел нажимает кнопку HUD, выбранную клавишей Tab', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await page.evaluate(() => { waveTimer = 99999; energy = 1000; updateResourceUI(); });
    await page.keyboard.press('Tab'); // игрок перешёл на управление интерфейсом с клавиатуры
    await page.locator('#produce-btn').focus();
    const before = await page.evaluate(() => units.length);
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => units.length)).toBe(before + 1);
});

test('BUG-020 длительность боя не включает паузу', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await fastForward(page, 5);
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('dialog', { name: /ПАУЗА|PAUSE/ })).toBeVisible();
    const t0 = await page.evaluate(() => getGameTime());
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => getGameTime())).toBe(t0);
    await page.keyboard.press('KeyP');
    await page.evaluate(() => { enemyHQ.hp = 0; });
    await expect(page.getByRole('dialog', { name: /Победа|Victory/ })).toBeVisible();
    const shown = await page.locator('#game-over-stats dd').first().textContent();
    const [mm, ss] = shown.split(':').map(Number);
    const played = await page.evaluate(() => getGameTime() - matchStats.startGameTime);
    expect(Math.abs(mm * 60 + ss - Math.floor(played))).toBeLessThanOrEqual(1);
});
