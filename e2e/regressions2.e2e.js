// Регрессионные тесты аудита 2026-11-10 (вторая часть): BUG-021 … BUG-033 из bugs.md.
// Каждый тест воспроизводил баг на сборке до исправления.
const { test, expect, openGame, startMatch, state, fastForward, orderSelectedTo, clearBattlefield } = require('./fixtures');

// Выбрать карту, размер и сид в меню (как игрок), до нажатия «Играть»
function pickMap(page, mapId, seed, size = '256') {
    return page.evaluate(([m, s, z]) => { setMapSize(z); selectMap(m); setMapSeed(s, true); }, [mapId, seed, size]);
}

// Пустое поле: ни союзников, ни врагов, волны отложены, штабы неуязвимы
function emptyField(page) {
    return page.evaluate(() => {
        waveTimer = 99999;
        enemies.forEach(e => { e.hp = 0; });
        units.forEach(u => { u.hp = 0; });
        stepSimulation(1 / 30, simElapsedTime);
        playerHQ.hp = playerHQ.maxHp = 1e9;
        enemyHQ.hp = enemyHQ.maxHp = 1e9;
    });
}

test('BUG-021 строй стоит поперёк движения в любую сторону, а не только по диагонали', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    await page.evaluate(() => { energy = 5000; for (let i = 0; i < 4; i++) produceUnit('standard'); setFormation('line'); units.forEach(u => { u.selected = true; }); });
    const center = await page.evaluate(() => ({
        x: units.reduce((a, u) => a + u.mesh.position.x, 0) / units.length,
        z: units.reduce((a, u) => a + u.mesh.position.z, 0) / units.length
    }));
    for (const [dx, dz] of [[30, 0], [0, 30], [25, 25]]) {
        await orderSelectedTo(page, center.x + dx, center.z + dz);
        const spread = await page.evaluate(([dx, dz]) => {
            const len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len;
            const pts = units.map(u => u.personalTarget);
            const along = pts.map(p => p.x * fx + p.z * fz), across = pts.map(p => -p.x * fz + p.z * fx);
            const range = a => Math.max(...a) - Math.min(...a);
            return { along: range(along), across: range(across) };
        }, [dx, dz]);
        // 9 юнитов в шеренге: до 8 интервалов по 1.2 поперёк движения (место у стены сдвигается к центру),
        // по ходу — в одну линию. До исправления при движении вдоль осей было наоборот: 0 поперёк и 9.6 вглубь.
        expect(spread.across, `ширина строя при движении (${dx}, ${dz})`).toBeGreaterThan(5);
        expect(spread.along, `глубина строя при движении (${dx}, ${dz})`).toBeLessThan(2);
    }
});

test.describe('BUG-022 сохранённая громкость действует сразу после загрузки', () => {
    test.use({ settings: { schema: 2, language: 'ru', masterVolume: 0.2, sfxVolume: 0.5, musicVolume: 0 } });
    test('шины звука созданы с громкостями из настроек; быстрый перезапуск эмбиента его не глушит (BUG-023)', async ({ page }) => {
        await openGame(page);
        await startMatch(page); // клик по «Играть» создаёт аудиоконтекст
        const gains = await page.evaluate(() => [soundEngine.masterGain.gain.value, soundEngine.sfxGain.gain.value, soundEngine.musicGain.gain.value]);
        expect(gains[0]).toBeCloseTo(0.2 * 0.85, 4);
        expect(gains[1]).toBeCloseTo(0.5 * 0.8, 4);
        expect(gains[2]).toBe(0);

        // итог боя и сразу «Играть снова»: эмбиент останавливается и тут же запускается
        await page.evaluate(() => { soundEngine.stopAmbient(); soundEngine.startAmbient(); });
        await page.waitForTimeout(2600);
        expect(await page.evaluate(() => ({ running: soundEngine.ambientRunning, nodes: soundEngine.ambientNodes.length }))).toEqual({ running: true, nodes: 4 });
    });
});

test('BUG-024 волна обходит кристалл в центре карты и вся доходит до штаба', async ({ page }) => {
    await openGame(page);
    await pickMap(page, 'arena', 11);
    await startMatch(page);
    await emptyField(page);
    const spawned = await page.evaluate(() => { waveNumber = 6; spawnWave(); waveTimer = 99999; return enemies.length; });
    expect(spawned).toBe(13);
    await fastForward(page, 260);
    const far = await page.evaluate(() => enemies
        .filter(e => e.mesh.position.distanceTo(playerHQ.mesh.position) > e.attackRange + playerHQ.radius + 0.5)
        .map(e => [e.type, Math.round(e.mesh.position.x), Math.round(e.mesh.position.z)]));
    expect(far).toEqual([]);
});

test('BUG-024 с кольца захвата кристалла отряд уходит по новому приказу и может вернуться', async ({ page }) => {
    await openGame(page);
    await pickMap(page, 'arena', 11);
    await startMatch(page);
    await clearBattlefield(page);
    await page.evaluate(() => { enemyHQ.hp = enemyHQ.maxHp = 1e9; units.forEach(u => { u.selected = true; }); });
    const node = await page.evaluate(() => { const n = resourceNodes[3]; return { x: n.pos.x, z: n.pos.z }; }); // «Гамма», ближняя к базе
    // приказ прямо на кристалл: отряд встаёт на кольце захвата и берёт точку
    await orderSelectedTo(page, node.x, node.z);
    await fastForward(page, 60);
    expect(await page.evaluate(() => resourceNodes[3].owner)).toBe('player');
    // часть отряда стоит в клетке кристалла; новый приказ должен увести всех
    await orderSelectedTo(page, node.x, node.z + 48);
    await fastForward(page, 45);
    const res = await page.evaluate(([x, z]) => units.map(u => ({ st: u.state, d: Math.round(Math.hypot(u.mesh.position.x - x, u.mesh.position.z - z)) })), [node.x, node.z + 48]);
    expect(res.filter(r => r.st !== 'IDLE' || r.d > 10)).toEqual([]);
});

test('BUG-025 армия проходит лабиринт без застрявших на углах стен', async ({ page }) => {
    await openGame(page);
    await pickMap(page, 'maze', 11);
    await startMatch(page);
    await emptyField(page);
    await page.evaluate(() => {
        energy = 5000;
        for (let i = 0; i < 6; i++) produceUnit('standard');
        for (let i = 0; i < 3; i++) produceUnit('scout');
        for (let i = 0; i < 3; i++) produceUnit('tank');
        units.forEach(u => { u.selected = true; });
    });
    const legs = await page.evaluate(() => {
        const eh = enemyHQ.mesh.position;
        return [
            [resourceNodes[1].pos.x + 3, resourceNodes[1].pos.z + 3],
            [eh.x - 14, eh.z - 14],
            [resourceNodes[0].pos.x + 3, resourceNodes[0].pos.z - 3],
            [resourceNodes[2].pos.x - 3, resourceNodes[2].pos.z + 3]
        ];
    });
    for (const [tx, tz] of legs) {
        const dmax = await page.evaluate(([x, z]) => Math.max(...units.map(u => Math.hypot(u.mesh.position.x - x, u.mesh.position.z - z))), [tx, tz]);
        await orderSelectedTo(page, tx, tz);
        await fastForward(page, dmax / 3 * 2.2 + 20); // танк (скорость 3) с запасом ×2.2 на обход стен
        const lost = await page.evaluate(([x, z]) => units
            .map(u => ({ type: u.type, st: u.state, d: Math.round(Math.hypot(u.mesh.position.x - x, u.mesh.position.z - z)) }))
            .filter(r => r.st === 'MOVE' || r.d > 16), [tx, tz]);
        expect(lost, `переход к (${Math.round(tx)}, ${Math.round(tz)})`).toEqual([]);
    }
    expect(await page.evaluate(() => units.length)).toBe(12);
});

test('BUG-026 диверсанты доходят до точки сбора в лабиринте', async ({ page }) => {
    await openGame(page);
    await pickMap(page, 'maze', 4242);
    await startMatch(page);
    await emptyField(page);
    const squad = await page.evaluate(() => {
        resourceNodes.forEach(n => { n.owner = 'player'; n.captureProgress = 1; });
        retaliationCooldown = 0;
        stepSimulation(1 / 30, simElapsedTime);
        retaliationCooldown = 99999;
        window.__node = enemies.find(e => e.sabotageNode).sabotageNode;
        return enemies.filter(e => e.sabotageNode).length;
    });
    expect(squad).toBe(3);
    await fastForward(page, 60);
    // разведчики (скорость 8.5) проходят 121 единицу пути примерно за 25 с и отбивают точку
    expect(await page.evaluate(() => window.__node.owner)).not.toBe('player');
    // после захвата отряд идёт на штаб, поле волн при этом цело
    await fastForward(page, 200);
    const far = await page.evaluate(() => enemies.filter(e => e.mesh.position.distanceTo(playerHQ.mesh.position) > e.attackRange + playerHQ.radius + 0.5).length);
    expect(far).toBe(0);
});

test('BUG-027…030 осада: сплэш не пробивает щит, индикаторы видны, приказ движения не принимается', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    // --- BUG-028: подпись активного щита на панели способностей
    await page.evaluate(() => { units.forEach(u => { u.selected = true; }); triggerAbilityForSelected('shield'); updateAbilityUI(); });
    await expect(page.locator('#status-ability-shield')).toHaveText(/^АКТИВНО \(\d\.\dс\)$/);
    // --- BUG-029: пузырь щита и кольцо осады рисуются в режиме GPU-инстансинга
    await page.evaluate(() => {
        energy = 1000; produceUnit('tank');
        const tank = units[units.length - 1];
        units.forEach(u => { u.selected = (u === tank); if (u !== tank) u.damage = 0; });
        toggleTankSiege(tank, getGameTime());
        window.__tank = tank;
    });
    await expect.poll(() => page.evaluate(() => [instancedRenderer.enabled, instancedRenderer.shieldBubblesMesh.count, instancedRenderer.siegeRingsMesh.count])).toEqual([true, 5, 1]);
    // лазер при инстансинге — один общий меш, без дублирующей линии
    expect(await page.evaluate(() => { fireLaser(units[0].mesh.position, units[1].mesh.position, true, 'ally'); return laserMeshes.filter(l => l.visible).length; })).toBe(0);
    // --- BUG-030: танк в осаде приказ движения не принимает
    const p0 = await page.evaluate(() => ({ x: __tank.mesh.position.x, z: __tank.mesh.position.z }));
    await orderSelectedTo(page, p0.x + 20, p0.z + 20);
    expect(await page.evaluate(() => ({ st: __tank.state, target: __tank.personalTarget }))).toEqual({ st: 'IDLE', target: null });
    await expect(page.locator('#tactical-alert')).toHaveText(/осад/i);
    // --- BUG-027: сплэш осады по Левиафану под щитом снимает щит, а не корпус
    const before = await page.evaluate(() => {
        const tp = __tank.mesh.position;
        createEnemy(tp.x + 6, tp.z, 'standard'); const victim = enemies[enemies.length - 1];
        createEnemy(tp.x + 6, tp.z + 1.9, 'boss'); const boss = enemies[enemies.length - 1];
        victim.hp = victim.maxHp = 5000;
        [victim, boss].forEach(e => { e.damage = 0; e.speed = 0; });
        __tank.orderTarget = victim; __tank.targetEnemy = victim; __tank.state = States.CHASE;
        window.__boss = boss;
        return { hp: boss.hp, shield: boss.shield };
    });
    await fastForward(page, 8);
    const after = await page.evaluate(() => ({ hp: __boss.hp, shield: __boss.shield }));
    expect(after.hp).toBe(before.hp);
    expect(after.shield).toBeLessThan(before.shield);
    // после снятия осады танк стоит на месте, а не уезжает к старой цели
    await page.evaluate(() => { enemies.forEach(e => { e.hp = 0; }); __tank.lastSiegeSwitch = -99; toggleTankSiege(__tank, getGameTime()); });
    await fastForward(page, 5);
    const p1 = await page.evaluate(() => ({ x: __tank.mesh.position.x, z: __tank.mesh.position.z }));
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(1);
});

test('BUG-031 стресс-тест не начисляет энергию и запускается с экрана итога боя', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    const e = await page.evaluate(() => {
        const before = Math.floor(energy);
        runBenchmark(100);
        for (let k = 0; k < 10; k++) enemies[k].hp = 0;
        stepSimulation(1 / 30, simElapsedTime);
        const after = Math.floor(energy);
        stopBenchmark();
        return { before, after };
    });
    expect(e.after - e.before).toBeLessThanOrEqual(5); // только пассивный доход за тик, без +100 за «фраги»
    await page.evaluate(() => { triggerGameOver(false); runBenchmark(100); });
    await page.waitForTimeout(1200);
    const s = await page.evaluate(() => ({ over: gameOver, bench: benchmarkActive, t0: simElapsedTime }));
    expect(s).toMatchObject({ over: false, bench: true });
    await page.waitForFunction(t => simElapsedTime > t, s.t0, { polling: 200 }); // симуляция идёт, а не стоит
    await page.evaluate(() => stopBenchmark());
});

test('BUG-032 выбор карты в меню сразу перестраивает сцену, отряд стоит на базе новой карты', async ({ page }) => {
    test.setTimeout(180_000); // три перестройки карты и два старта матча на программном WebGL
    await openGame(page);
    const fingerprint = () => page.evaluate(() => grid.map(r => r.join('')).join('|'));
    const onBase = () => page.evaluate(() => {
        const base = gridToWorld(BASE_COL, BASE_ROW);
        return units.length === 5 && units.every(u => Math.hypot(u.mesh.position.x - base.x, u.mesh.position.z - base.z) < 3 * CELL_SIZE);
    });
    // сразу после загрузки: отряд на базе загруженной карты, а не в координатах сетки 22×22
    expect(await onBase()).toBe(true);
    const g0 = await fingerprint();
    await page.getByLabel(/Карта|Map/).first().selectOption('maze');
    const g1 = await fingerprint();
    expect(g1).not.toBe(g0);
    expect(await onBase()).toBe(true);
    await page.getByLabel(/Размер|Size/).selectOption('512');
    expect(await page.evaluate(() => [GRID_SIZE, resourceNodes.length])).toEqual([128, 7]);
    expect(await onBase()).toBe(true);
    await page.getByLabel(/Размер|Size/).selectOption('256'); // матч ниже — на малой карте: она рисуется быстрее
    // BUG-034: «Играть» запускает именно показанную карту — сид в поле и стены за меню не меняются
    await page.getByRole('button', { name: /случайный сид|random seed/i }).click(); // 🎲
    const shownSeed = await page.locator('#map-seed-input').inputValue();
    const g2 = await fingerprint();
    await startMatch(page);
    expect(await page.evaluate(() => String(getMapSeed()))).toBe(shownSeed);
    expect(await fingerprint()).toBe(g2);
    // «Играть снова» без своего сида — новая карта
    await page.evaluate(() => restartMatch());
    expect(await page.evaluate(() => String(getMapSeed()))).not.toBe(shownSeed);
    // из матча в меню: за меню стартовая расстановка на карте следующего матча, её сид — в поле
    await page.evaluate(() => { energy = 500; produceUnit('tank'); returnToMainMenu(); });
    expect(await state(page)).toMatchObject({ started: false, allies: 5, enemies: 3 });
    expect(await onBase()).toBe(true);
    expect(await page.locator('#map-seed-input').inputValue()).toBe(await page.evaluate(() => String(getMapSeed())));
});

test.describe('BUG-033 зум колесом на большой карте', () => {
    test.use({ settings: { schema: 2, language: 'ru', mapSize: '1024' } });
    test('от стартового вида до общего плана — не больше 60 щелчков колеса', async ({ page }) => {
        await openGame(page);
        await startMatch(page);
        // события колеса — на холсте, одним вызовом: программный WebGL на карте 1024 рисует кадр долго
        const notches = await page.evaluate(() => {
            let n = 0;
            while (n < 200 && camZoomDist < MAX_ZOOM_DIST - 0.01) {
                renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
                n++;
            }
            return n;
        });
        expect(notches).toBeLessThanOrEqual(60);
        expect(notches).toBeGreaterThan(20); // и не рывком
    });
});

test('@mobile тап по кнопке HUD сразу после тапа по полю не отдаёт приказ под кнопкой', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'только тач');
    await openGame(page);
    await startMatch(page);
    await clearBattlefield(page);
    const res = await page.evaluate(async () => {
        // камера в центре карты: под любой точкой экрана есть земля
        camPivot.set(0, 0, 0); applyCameraTransform(); camera.updateMatrixWorld(true);
        units.forEach(u => { u.selected = true; });
        const fire = (type, x, y, target) => {
            const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
            target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
        };
        const canvas = renderer.domElement;
        const btn = document.getElementById('touch-mode-btn');
        const r = btn.getBoundingClientRect();
        fire('touchstart', innerWidth / 2, innerHeight / 2, canvas); fire('touchend', innerWidth / 2, innerHeight / 2, canvas);
        const first = units[0].personalTarget.clone();
        await new Promise(done => setTimeout(done, 100));
        fire('touchstart', r.left + 8, r.top + 8, btn); fire('touchend', r.left + 8, r.top + 8, btn);
        return { moved: first.distanceTo(units[0].personalTarget) };
    });
    expect(res.moved).toBe(0);
});
