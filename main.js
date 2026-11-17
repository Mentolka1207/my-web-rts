// =============================================================================
// main.js — Главный оркестратор и игровой цикл Tabhold
// Модульная архитектура:
// - js/config.js      — Константы, архетипы юнитов и дебаггер
// - js/grid.js        — Сетка карты и преобразование координат
// - js/formations.js  — Тактические построения (Шеренга, Клин)
// - js/flowfield.js   — Высокопроизводительный поиск пути Flow Field (BFS)
// - js/scene.js       — Three.js сцена, камера, освещение и рендер
// - js/terrain.js     — Процедурные текстуры, поверхность и препятствия
// - js/healthbar.js   — 3D полоски здоровья и щита
// - js/models.js      — 3D модели дронов, флагмана-Левиафана и штабов
// - js/particles.js   — Пул частиц (THREE.Points): искры попаданий и обломки взрывов
// - js/effects.js     — Пул лазеров, вспышек и следов попаданий
// - js/units.js       — Юниты, спавн, физика анимаций и проверка позиций
// - js/resources.js   — Кристаллы сбора ресурсов и логика захвата
// - js/economy.js     — Энергия, доходы и производство
// - js/ai.js          — ИИ врагов, составные волны и тактические контратаки
// - js/minimap.js     — Миникарта с кэшированием и масштабируемыми маркерами
// - js/input.js       — Управление: выбор, приказы, MMB панорама и сенсор
// - js/ui.js          — Меню, оповещения и экраны победы/поражения
// Инициализация GPU Instanced Rendering менеджера и Web Worker SoA
if (typeof instancedRenderer !== 'undefined') {
    instancedRenderer.init(scene);
}
if (typeof simWorkerManager !== 'undefined') {
    simWorkerManager.init(grid, MAP_WORLD_SIZE, CELL_SIZE);
}

// Создание начальных отрядов
initStartingUnits();

// Переиспользуемый плоский массив активных юнитов для коллизий (Zero-Allocation)
const _allActiveUnits = [];

// Переиспользуемый контекст и буфер событий для чистого FSM (js/fsm.js)
const _fsmFindNearest = (pos, range, team) => spatialGrid.findNearest(pos, range, team);
const _fsmCtx = {
    grid: null,
    gridSize: 0,
    cellSize: 4,
    halfWorld: 128,
    flowField: null,
    enemyHQ: null,
    enemies: null,
    findNearest: _fsmFindNearest,
    hasLineOfSight: typeof hasLineOfSight === 'function' ? hasLineOfSight : null,
    findBypassDirection: typeof findBypassDirection === 'function' ? findBypassDirection : null,
    gameTime: 0,
    events: typeof createFSMEvents === 'function' ? createFSMEvents() : { damage: [], laser: [], explosion: [], hitFlash: [] }
};

function applyFSMEvents(events) {
    if (!events) return;
    for (let i = 0; i < events.damage.length; i++) {
        const ev = events.damage[i];
        applyDamageToEnemy(ev.target, ev.amount);
    }
    for (let i = 0; i < events.laser.length; i++) {
        const ev = events.laser[i];
        fireLaser(ev.from, ev.to, ev.isAlly, ev.soundType);
    }
    for (let i = 0; i < events.explosion.length; i++) {
        const ev = events.explosion[i];
        spawnExplosion(ev.position, ev.count);
    }
    for (let i = 0; i < events.hitFlash.length; i++) {
        const ev = events.hitFlash[i];
        spawnHitFlash(ev.position, ev.isAlly);
    }
    if (typeof clearFSMEvents === 'function') {
        clearFSMEvents(events);
    } else {
        events.damage.length = 0;
        events.laser.length = 0;
        events.explosion.length = 0;
        events.hitFlash.length = 0;
    }
}

// Таймер Three.js r186 (замена устаревшему THREE.Clock с сохранением обратной совместимости)
const rtsTimer = (typeof THREE !== 'undefined' && THREE.Timer) ? new THREE.Timer() : null;
const rtsClock = rtsTimer ? null : (typeof THREE !== 'undefined' && THREE.Clock ? new THREE.Clock() : null);

const clock = {
    get elapsedTime() {
        return rtsTimer ? rtsTimer.getElapsed() : (rtsClock ? rtsClock.elapsedTime : (performance.now() / 1000));
    },
    getDelta() {
        return rtsTimer ? rtsTimer.getDelta() : (rtsClock ? rtsClock.getDelta() : 0.016);
    }
};

// Детерминированный цикл симуляции (Fixed Timestep 30 Hz = 33.33ms)
const FIXED_TIMESTEP = 1 / 30;
let simAccumulator = 0;
let simElapsedTime = 0;
let simTickCount = 0;

// Один дискретный шаг симуляции мира
function stepSimulation(delta, currentTime) {
    // 1. Точки сбора ресурсов и подсчёт контроля
    const playerNodesCount = updateResourceNodes(delta, currentTime);

    // 2. Пассивный приток энергии
    energyAccumulator += delta;
    if (energyAccumulator >= 1) {
        energyAccumulator -= 1;
        const baseInc = (typeof getBaseIncome === 'function') ? getBaseIncome() : ENERGY_INCOME_PER_SEC;
        const inc = (baseInc + playerNodesCount * NODE_ENERGY_BONUS);
        energy += inc;
        if (typeof matchStats !== 'undefined' && (typeof benchmarkActive === 'undefined' || !benchmarkActive)) {
            matchStats.energyHarvested += inc;
        }
        updateResourceUI();
    }

    // 3. Таймер волн врагов
    waveTimer -= delta;
    if (waveTimer <= 10 && !waveWarningGiven && gameStarted) {
        waveWarningGiven = true;
        const nextWave = waveNumber + 1;
        const isBoss = (nextWave === 10 || (nextWave > 10 && nextWave % 10 === 0));
        showTacticalAlert(isBoss
            ? (typeof t === 'function' ? t('ALERT_WAVE_10S_BOSS') : `⚠️ ТРЕВОГА: Приближается БОСС «Левиафан» через 10с!`)
            : (typeof t === 'function' ? t('ALERT_WAVE_10S_NORMAL', nextWave) : `🌊 Внимание: Волна ${nextWave} начнётся через 10 секунд!`),
            isBoss);
    }
    if (waveTimer <= 0) {
        waveTimer += (typeof getWaveInterval === 'function' ? getWaveInterval() : WAVE_INTERVAL);
        spawnWave();
    }
    updateWaveUI();

    // 4. Проверка условий контратаки ИИ (диверсии при контроле 3/3 точек)
    checkAIRetaliation(delta);

    // 5. Полоски здоровья штабов
    if (playerHQ && playerHQ.healthBar && playerHQ.hp > 0) updateHealthBar(playerHQ.healthBar, playerHQ.hp, playerHQ.maxHp);
    if (enemyHQ && enemyHQ.healthBar && enemyHQ.hp > 0) updateHealthBar(enemyHQ.healthBar, enemyHQ.hp, enemyHQ.maxHp);

    const totalSimUnits = units.length + enemies.length;
    // Упрощённая SoA-симуляция (пул воркеров или её синхронный вариант) считает только стресс-тест:
    // в ней нет фокус-атаки, обхода стен, сплэша осады, залпов босса, марша волн на штаб и диверсий.
    // Обычный матч всегда идёт через полный FSM ниже.
    const useSimWorker = (typeof simWorkerPool !== 'undefined' && simWorkerPool.enabled &&
        typeof benchmarkActive !== 'undefined' && benchmarkActive);
    let spatialTimeAcc = 0;

    if (useSimWorker) {
        const hqData = {
            playerX: (playerHQ && playerHQ.mesh) ? playerHQ.mesh.position.x : 0,
            playerZ: (playerHQ && playerHQ.mesh) ? playerHQ.mesh.position.z : 0,
            playerHp: playerHQ ? playerHQ.hp : 0,
            enemyX: (enemyHQ && enemyHQ.mesh) ? enemyHQ.mesh.position.x : 0,
            enemyZ: (enemyHQ && enemyHQ.mesh) ? enemyHQ.mesh.position.z : 0,
            enemyHp: enemyHQ ? enemyHQ.hp : 0
        };

        if (simWorkerPool.isMultiThreaded) {
            if (!simWorkerPool.isBusy) {
                simWorkerPool.dispatchParallel(units, enemies, delta, currentTime, hqData);
            }
        } else {
            simWorkerPool.stepSync(units, enemies, delta, currentTime, grid, MAP_WORLD_SIZE, CELL_SIZE, hqData);
        }

        if (typeof engineProfiler !== 'undefined') {
            engineProfiler.fsmTime = simWorkerPool.lastStepDuration;
            engineProfiler.spatialTime = 0;
            const isNaive = (typeof spatialGrid !== 'undefined' && spatialGrid.collisionMode === 'naive');
            engineProfiler.pairsTested = isNaive
                ? simWorkerPool.activeUnits.length * Math.min(simWorkerPool.activeUnits.length, 500)
                : simWorkerPool.activeUnits.length * 9;
        }
    } else {
        // 5.5. Обновление пространственного хеша для O(1) поиска целей и коллизий
        const spatialT0 = performance.now();
        spatialGrid.clear();
        for (let i = 0; i < units.length; i++) {
            if (units[i].hp > 0) spatialGrid.insert(units[i], false);
        }
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].hp > 0) spatialGrid.insert(enemies[i], true);
        }
        spatialTimeAcc = performance.now() - spatialT0;

        // 6. FSM логика союзных юнитов игрока (чистый модуль js/fsm.js)
        const fsmT0 = performance.now();
        _fsmCtx.grid = grid;
        _fsmCtx.gridSize = GRID_SIZE;
        _fsmCtx.cellSize = CELL_SIZE;
        _fsmCtx.halfWorld = MAP_WORLD_SIZE * 0.5;
        _fsmCtx.flowField = typeof flowFieldGen !== 'undefined' ? flowFieldGen : null;
        _fsmCtx.enemyHQ = typeof enemyHQ !== 'undefined' ? enemyHQ : null;
        _fsmCtx.enemies = enemies;
        _fsmCtx.hasLineOfSight = typeof hasLineOfSight === 'function' ? hasLineOfSight : null;
        _fsmCtx.findBypassDirection = typeof findBypassDirection === 'function' ? findBypassDirection : null;
        _fsmCtx.gameTime = currentTime;
        if (typeof clearFSMEvents === 'function') clearFSMEvents(_fsmCtx.events);

        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            if (unit.hp <= 0) continue;

            updateHealthBar(unit.healthBar, unit.hp, unit.maxHp, unit.shield || 0, unit.maxShield || 50);
            stepUnitFSM(unit, delta, _fsmCtx);
            applyFSMEvents(_fsmCtx.events);
        }

    // 7. FSM логика врагов и Босса
    updateEnemiesAI(currentTime, delta);

    if (typeof engineProfiler !== 'undefined') {
        engineProfiler.fsmTime = performance.now() - fsmT0;
    }
    }

    // 7.5. Таймеры способностей (форсаж, щит) — игровая логика, идёт всегда, в том числе когда
    //      анимации моделей ниже пропускаются (инстансинг при 500+ юнитах)
    for (let i = 0; i < units.length; i++) updateUnitAbilityTimers(units[i], delta);

    // 8. Визуальные эффекты дронов (пропеллеры, сопла, пульсация)
    const isInstanced = (typeof instancedRenderer !== 'undefined' && instancedRenderer.enabled);
    if (!isInstanced || totalSimUnits < 500) {
        for (let i = 0; i < units.length; i++) updateUnitVisuals(units[i], currentTime, delta);
        for (let i = 0; i < enemies.length; i++) updateUnitVisuals(enemies[i], currentTime, delta);
    } else {
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].type === 'boss') updateUnitVisuals(enemies[i], currentTime, delta);
        }
    }

    // 9. Гибель и удаление уничтоженных юнитов
    for (let i = units.length - 1; i >= 0; i--) {
        const u = units[i];
        if (u.hp <= 0) {
            spawnExplosion(u.mesh.position, 10);
            spawnScorch(u.mesh.position);
            if (u.mesh.userData) {
                if (u.mesh.userData.shieldMesh && u.mesh.userData.shieldMesh.material) u.mesh.userData.shieldMesh.material.dispose();
                if (u.mesh.userData.siegeMesh && u.mesh.userData.siegeMesh.material) u.mesh.userData.siegeMesh.material.dispose();
            }
            if (u.mesh.parent) u.mesh.parent.remove(u.mesh);
            units.splice(i, 1);
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.hp <= 0) {
            const isBoss = e.type === 'boss';
            spawnExplosion(e.mesh.position, isBoss ? 36 : 10);
            spawnScorch(e.mesh.position);
            if (e.mesh.userData && e.mesh.userData.shieldMesh && e.mesh.userData.shieldMesh.material) {
                e.mesh.userData.shieldMesh.material.dispose();
            }
            if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
            enemies.splice(i, 1);
            const reward = e.reward || ENEMY_KILL_REWARD;
            // Армии стресс-теста энергию не приносят: иначе тест 5000×5000 оставлял игроку десятки тысяч ⚡
            // на продолжение обычного матча (и на рекорд)
            if (typeof benchmarkActive === 'undefined' || !benchmarkActive) energy += reward;
            if (typeof matchStats !== 'undefined' && (typeof benchmarkActive === 'undefined' || !benchmarkActive)) {
                matchStats.energyHarvested += reward;
                matchStats.enemiesKilled++;
                if (isBoss) matchStats.bossesKilled++;
            }
            updateResourceUI();
            if (isBoss && (typeof benchmarkActive === 'undefined' || !benchmarkActive)) {
                showTacticalAlert(typeof t === 'function' ? t('BOSS_DESTROYED_ALERT') : '🏆 БОСС «ЛЕВИАФАН» УНИЧТОЖЕН! (+100⚡)', false);
            }
        }
    }


    // Проверка победы или поражения
    checkGameOverConditions();
    if (typeof checkBenchmarkCompletion === 'function' && typeof benchmarkActive !== 'undefined' && benchmarkActive) {
        checkBenchmarkCompletion();
    }

    // 10. Высокопроизводительное пространственное расталкивание юнитов и коллизии с препятствиями
    const numAllies = units.length;
    const numEnemies = enemies.length;
    const totalUnits = numAllies + numEnemies;

    function resolveUnitEnvironmentCollisions(u) {
        const pos = u.mesh.position;
        const r = u.radius;

        // А. Ограничение границами арены
        const maxBound = (MAP_WORLD_SIZE * 0.5) - (CELL_SIZE * 1.05) - r;
        pos.x = THREE.MathUtils.clamp(pos.x, -maxBound, maxBound);
        pos.z = THREE.MathUtils.clamp(pos.z, -maxBound, maxBound);

        // Б. Коллизии с твердыми кристаллами точек сбора ресурсов (Cylinder Core)
        if (typeof resourceNodes !== 'undefined') {
            for (let rn = 0; rn < resourceNodes.length; rn++) {
                const node = resourceNodes[rn];
                const diffX = pos.x - node.pos.x;
                const diffZ = pos.z - node.pos.z;
                const minD = RESOURCE_CORE_RADIUS + r;
                const dSq = diffX * diffX + diffZ * diffZ;
                if (dSq < minD * minD) {
                    let d = Math.sqrt(dSq);
                    let nx, nz;
                    if (d > 0.0001) {
                        nx = diffX / d;
                        nz = diffZ / d;
                    } else {
                        nx = 1; nz = 0;
                        d = 0.0001;
                    }
                    pos.x = node.pos.x + nx * minD;
                    pos.z = node.pos.z + nz * minD;
                }
            }
        }

        // В. Точные прямоугольные коллизии стен (Circle vs Box AABB) и штабов
        const gridPos = worldToGrid(pos.x, pos.z);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nc = gridPos.col + dx;
                const nr = gridPos.row + dy;
                if (nc >= 0 && nc < GRID_SIZE && nr >= 0 && nr < GRID_SIZE && grid[nr][nc] === 1) {
                    const isHQCell = (nr === HQ_ROW && nc === HQ_COL) || (nr === ENEMY_HQ_ROW && nc === ENEMY_HQ_COL);
                    let minX, maxX, minZ, maxZ;

                    if (isHQCell) {
                        const hqObj = (nr === HQ_ROW && nc === HQ_COL) ? playerHQ : enemyHQ;
                        if (hqObj && hqObj.mesh) {
                            const hqCenter = hqObj.mesh.position;
                            const hw = 1.8; // База штаба 3.6 x 3.6
                            minX = hqCenter.x - hw; maxX = hqCenter.x + hw;
                            minZ = hqCenter.z - hw; maxZ = hqCenter.z + hw;
                        } else {
                            const wallPos = gridToWorld(nc, nr);
                            const hw = 1.8;
                            minX = wallPos.x - hw; maxX = wallPos.x + hw;
                            minZ = wallPos.z - hw; maxZ = wallPos.z + hw;
                        }
                    } else {
                        const wallPos = gridToWorld(nc, nr);
                        // Половина ширины монолита стены: меш рисуется шириной CELL_SIZE * 0.98 (js/terrain.js).
                        // Раньше здесь стояло 0.98 для клетки 2×2 — при клетке 4×4 юниты входили в стену на метр.
                        const hw = CELL_SIZE * 0.49;
                        minX = wallPos.x - hw; maxX = wallPos.x + hw;
                        minZ = wallPos.z - hw; maxZ = wallPos.z + hw;
                    }

                    // Ближайшая точка AABB коробки
                    const clX = Math.max(minX, Math.min(pos.x, maxX));
                    const clZ = Math.max(minZ, Math.min(pos.z, maxZ));
                    const offX = pos.x - clX;
                    const offZ = pos.z - clZ;
                    const distSq = offX * offX + offZ * offZ;

                    if (distSq > 0.000001) {
                        if (distSq < r * r) {
                            const dist = Math.sqrt(distSq);
                            const push = r - dist;
                            pos.x += (offX / dist) * push;
                            pos.z += (offZ / dist) * push;
                        }
                    } else {
                        // Центр юнита оказался внутри коробки препятствия — выталкиваем к ближайшей грани
                        const dL = pos.x - minX;
                        const dR = maxX - pos.x;
                        const dT = pos.z - minZ;
                        const dB = maxZ - pos.z;
                        const minD = Math.min(dL, dR, dT, dB);
                        if (minD === dL) pos.x = minX - r;
                        else if (minD === dR) pos.x = maxX + r;
                        else if (minD === dT) pos.z = minZ - r;
                        else pos.z = maxZ + r;
                    }
                }
            }
        }
    }

    // 10. Высокопроизводительное пространственное расталкивание юнитов и коллизии с препятствиями
    if (!useSimWorker) {
        const sepT0 = performance.now();
        _allActiveUnits.length = 0;
        for (let i = 0; i < units.length; i++) if (units[i].hp > 0) _allActiveUnits.push(units[i]);
        for (let i = 0; i < enemies.length; i++) if (enemies[i].hp > 0) _allActiveUnits.push(enemies[i]);

        spatialGrid.resolveSeparation(_allActiveUnits);
        for (let i = 0; i < _allActiveUnits.length; i++) {
            resolveUnitEnvironmentCollisions(_allActiveUnits[i]);
        }
        spatialTimeAcc += (performance.now() - sepT0);

        if (typeof engineProfiler !== 'undefined') {
            engineProfiler.spatialTime = spatialTimeAcc;
            engineProfiler.pairsTested = spatialGrid.pairsTested;
        }
    }
}

// Главный игровой цикл (Zero-allocation RAF loop c Fixed Timestep симуляции)
function animate(timestamp) {
    requestAnimationFrame(animate);
    const tickT0 = performance.now();
    try {
        if (typeof soundEngine !== 'undefined' && soundEngine.resetTickStats) {
            soundEngine.resetTickStats();
        }
        if (rtsTimer) rtsTimer.update(timestamp);
        const rawDelta = Math.min(rtsTimer ? rtsTimer.getDelta() : (rtsClock ? rtsClock.getDelta() : 0.016), 0.15);
        const currentTime = rtsTimer ? rtsTimer.getElapsed() : (rtsClock ? rtsClock.elapsedTime : (performance.now() * 0.001));

        // Обновление позиции камеры по WASD / Стрелкам (привязано к кадру)
        updateCamera(rawDelta);

        // Обработка очереди ленивых запросов Flow Field
        if (typeof flowFieldGen !== 'undefined' && flowFieldGen.processPendingTarget) {
            flowFieldGen.processPendingTarget();
        }
        if (typeof enemyFlowFieldGen !== 'undefined' && enemyFlowFieldGen.processPendingTarget) {
            enemyFlowFieldGen.processPendingTarget();
        }

        // Детерминированный цикл с защитой от накопления (макс 4 тика за кадр)
        simAccumulator += rawDelta;
        let maxSimulationTicks = 4;
        while (simAccumulator >= FIXED_TIMESTEP && maxSimulationTicks > 0) {
            const simPaused = (typeof isSimulationPaused === 'function') ? isSimulationPaused() : (typeof isGamePaused !== 'undefined' && isGamePaused);
            if (gameStarted && !gameOver && !simPaused) {
                stepSimulation(FIXED_TIMESTEP, simElapsedTime);
            }
            // Игровое время идёт только в бою: не в меню, не на паузе и не после итога матча
            if (gameStarted && !gameOver && !simPaused) {
                simElapsedTime += FIXED_TIMESTEP;
                simTickCount++;
            }
            simAccumulator -= FIXED_TIMESTEP;
            maxSimulationTicks--;
        }
        // Долг по тикам не копим: после долгого кадра игра не должна «догонять» ускоренной перемоткой
        if (simAccumulator > FIXED_TIMESTEP) simAccumulator = FIXED_TIMESTEP;

        // 11. Обновление визуальных эффектов и миникарты
        updateVFX(rawDelta);
        updateExplosions(rawDelta);
        updateMinimap();

        // Сбор телеметрии движка
        if (typeof engineProfiler !== 'undefined') {
            engineProfiler.flowFieldTime = ((typeof flowFieldGen !== 'undefined' && flowFieldGen.lastComputeTime) || 0) +
                                           ((typeof enemyFlowFieldGen !== 'undefined' && enemyFlowFieldGen.lastComputeTime) || 0);
            engineProfiler.audioTime = (typeof soundEngine !== 'undefined') ? soundEngine.tickSynthesisTime : 0;
            engineProfiler.audioVoices = (typeof soundEngine !== 'undefined') ? soundEngine.activeVoices : 0;
            engineProfiler.soundEvents = (typeof soundEngine !== 'undefined') ? soundEngine.soundEventsThisTick : 0;
            engineProfiler.alliesCount = units.length;
            engineProfiler.enemiesCount = enemies.length;
            engineProfiler.totalUnits = units.length + enemies.length;
            let selectedNow = 0;
            for (let i = 0; i < units.length; i++) if (units[i].selected && units[i].hp > 0) selectedNow++;
            engineProfiler.selectedCount = selectedNow;
            if (typeof renderer !== 'undefined' && renderer.info) {
                engineProfiler.drawCalls = renderer.info.render.calls;
                engineProfiler.triangles = renderer.info.render.triangles;
                if (renderer.info.memory) {
                    engineProfiler.geometries = renderer.info.memory.geometries;
                    engineProfiler.textures = renderer.info.memory.textures;
                }
            }
        }

        // 12. Обновление Debug-Overlay и панели способностей
        if (typeof updateDebugOverlay === 'function') {
            updateDebugOverlay(rawDelta);
        }
        if (typeof updatePerfPanel === 'function') {
            updatePerfPanel(timestamp);
        }
        // Таймеры способностей на панели: без этого вызова отсчёт обновлялся только при клике по юниту
        if (typeof updateAbilityUI === 'function' && gameStarted && !gameOver) {
            updateAbilityUI(simElapsedTime);
        }
        // 12.5. GPU Instanced Rendering синхронизация (InstancedMesh)
        if (typeof instancedRenderer !== 'undefined' && instancedRenderer.enabled) {
            for (let i = 0; i < units.length; i++) {
                const u = units[i];
                if (u.mesh) u.mesh.visible = false;
                if (u.healthBar && u.healthBar.group) u.healthBar.group.visible = false;
            }
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.type !== 'boss') {
                    if (e.mesh) e.mesh.visible = false;
                    if (e.healthBar && e.healthBar.group) e.healthBar.group.visible = false;
                }
            }
            instancedRenderer.update(units, enemies, currentTime, rawDelta);
        } else if (typeof instancedRenderer !== 'undefined') {
            for (let i = 0; i < units.length; i++) {
                if (units[i].mesh) units[i].mesh.visible = true;
                if (units[i].healthBar && units[i].healthBar.group) units[i].healthBar.group.visible = true;
            }
            for (let i = 0; i < enemies.length; i++) {
                if (enemies[i].mesh) enemies[i].mesh.visible = true;
                if (enemies[i].healthBar && enemies[i].healthBar.group) enemies[i].healthBar.group.visible = true;
            }
            instancedRenderer.clear();
        }

        // 13. Финальный рендер кадра
        const renderT0 = performance.now();
        renderer.render(scene, camera);
    if (typeof engineProfiler !== 'undefined') {
        engineProfiler.renderTime = performance.now() - renderT0;
        engineProfiler.totalTickTime = performance.now() - tickT0;
    }
    } catch (err) {
        console.error('Ошибка в игровом цикле animate():', err);
        if (typeof showSystemError === 'function') {
            showSystemError(err, 'Игровой цикл (animate)');
        }
    }
}

// Старт игрового цикла
animate();