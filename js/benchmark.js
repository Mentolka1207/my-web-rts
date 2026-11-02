// =============================================================================
// js/benchmark.js — Автоматизированный стресс-тест, профилирование и телеметрия
// Пресеты спавна 100, 500, 1000, 1500+ юнитов через узкие проходы карты
// Переключение алгоритмов коллизий: Spatial Hashing O(N) vs Naive Brute-Force O(N²)
// Расчёт расхода видеопамяти (VRAM) процедурных Canvas-текстур и веса бандла
// =============================================================================

// Глобальное хранилище метрик производительности движка
const engineProfiler = {
    // Временные метрики кадра
    fps: 60,
    frameTime: 16.6,
    avgFps: 60,
    minFps: 60,
    fpsHistory: [],

    // Таймеры расчета подмодулей за текущий тик (performance.now() ms)
    flowFieldTime: 0,
    spatialTime: 0,
    fsmTime: 0,
    audioTime: 0,
    renderTime: 0,
    totalTickTime: 0,

    // Счётчики объектов и проверок коллизий
    alliesCount: 0,
    enemiesCount: 0,
    totalUnits: 0,
    selectedCount: 0,
    pairsTested: 0,

    // Графика и рендеринг Three.js
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,

    // Web Audio API
    audioVoices: 0,
    soundEvents: 0,

    // Статистика бандла и видеопамяти (Zero-Assets Architecture)
    bundleSizeKB: {
        html: 8.9,
        css: 12.8,
        jsCode: 204.2,
        threeJs: 648.5,
        totalGameSource: 225.9,
        totalWithThree: 874.4,
        externalDownloads: 0
    },

    // Расчёт VRAM процедурных текстур (Canvas PBR + декали + буферы)
    // 6 PBR текстур 512x512x4b + Mipmaps (1.33x) = ~8.4 MB
    // Scorch декали 256x256x4b = ~0.35 MB
    // Итого процедурный VRAM текстур: ~8.75 MB, внешних файлов: 0 байт
    vramProceduralMB: 8.75
};

let benchmarkActive = false;
let benchmarkTargetCount = 0;

// Очистка всех текущих юнитов с Three.js сцены (Zero-Memory Leak)
function clearAllUnitsForBenchmark() {
    for (let i = 0; i < units.length; i++) {
        if (units[i].mesh && units[i].mesh.parent) {
            units[i].mesh.parent.remove(units[i].mesh);
        }
    }
    units.length = 0;

    for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].mesh && enemies[i].mesh.parent) {
            enemies[i].mesh.parent.remove(enemies[i].mesh);
        }
    }
    enemies.length = 0;

    if (typeof spatialGrid !== 'undefined') {
        spatialGrid.clear();
    }
    if (typeof instancedRenderer !== 'undefined') {
        instancedRenderer.clear();
    }
    if (typeof particleSystem !== 'undefined') {
        particleSystem.clear();
    }
    if (typeof simWorld !== 'undefined') {
        simWorld.clear();
    }
    if (typeof simWorkerPool !== 'undefined') {
        simWorkerPool.clear();
    }
}

// Запуск стресс-теста на N юнитов (или allyCount vs enemyCount: 2000×2000, 5000×5000)
function runBenchmark(countOrAllies, maybeEnemies) {
    if (!gameStarted) {
        if (typeof startGame === 'function') startGame();
    }

    // Закрываем любые открытые модальные окна (обучение, настройки) и снимаем с паузы
    while (typeof modalStack !== 'undefined' && modalStack.length > 0) {
        const top = modalStack[modalStack.length - 1];
        if (typeof hideModal === 'function' && top && top.id) {
            hideModal(top.id, false);
        } else {
            modalStack.pop();
        }
    }
    if (typeof isGamePaused !== 'undefined' && isGamePaused) {
        if (typeof togglePause === 'function') togglePause();
        else isGamePaused = false;
    }

    benchmarkActive = true;
    let allyCount, enemyCount;
    if (typeof maybeEnemies === 'number') {
        allyCount = countOrAllies;
        enemyCount = maybeEnemies;
    } else {
        const total = countOrAllies || 500;
        const half = Math.floor(total / 2);
        allyCount = half;
        enemyCount = total - half;
    }
    const totalCount = allyCount + enemyCount;
    benchmarkTargetCount = totalCount;
    clearAllUnitsForBenchmark();

    // Временно приостанавливаем волны, чтобы они не мешали чистоте эксперимента
    waveTimer = 99999;

    // Динамический сбор проходимых клеток квадрантов для спавна
    // Союзники: Северо-Запад карты
    const allyMaxC = Math.max(7, Math.min(GRID_SIZE - 4, Math.floor(GRID_SIZE * 0.45)));
    const allyMaxR = Math.max(7, Math.min(GRID_SIZE - 4, Math.floor(GRID_SIZE * 0.45)));
    const allyCells = [];
    for (let r = 2; r <= allyMaxR; r++) {
        for (let c = 2; c <= allyMaxC; c++) {
            if (grid[r] && grid[r][c] === 0) {
                allyCells.push({ col: c, row: r });
            }
        }
    }
    if (allyCells.length === 0) allyCells.push({ col: HQ_COL || 4, row: HQ_ROW || 4 });

    // Враги: Юго-Восток карты
    const enemyMinC = Math.max(2, Math.floor(GRID_SIZE * 0.55));
    const enemyMinR = Math.max(2, Math.floor(GRID_SIZE * 0.55));
    const enemyCells = [];
    for (let r = enemyMinR; r < GRID_SIZE - 2; r++) {
        for (let c = enemyMinC; c < GRID_SIZE - 2; c++) {
            if (grid[r] && grid[r][c] === 0) {
                enemyCells.push({ col: c, row: r });
            }
        }
    }
    if (enemyCells.length === 0) enemyCells.push({ col: ENEMY_HQ_COL || (GRID_SIZE - 5), row: ENEMY_HQ_ROW || (GRID_SIZE - 5) });

    const unitTypes = ['standard', 'standard', 'scout', 'standard', 'tank'];
    const enemyTargetPos = gridToWorld(ENEMY_HQ_COL, ENEMY_HQ_ROW);
    const allyTargetPos = gridToWorld(HQ_COL, HQ_ROW);
    const maxSpread = (typeof CELL_SIZE !== 'undefined') ? CELL_SIZE * 0.38 : 1.5;

    let spawnedAllies = 0;
    while (spawnedAllies < allyCount) {
        const cell = allyCells[spawnedAllies % allyCells.length];
        const basePos = gridToWorld(cell.col, cell.row);
        const subSlot = Math.floor(spawnedAllies / allyCells.length);
        const angle = (spawnedAllies * 2.39996) % (Math.PI * 2);
        const radius = Math.min(maxSpread, 0.15 * Math.sqrt(subSlot + 1));
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;

        const uType = unitTypes[spawnedAllies % unitTypes.length];
        const stats = DRONE_TYPES[uType];
        const isMassSwarm = totalCount >= 1000 && typeof instancedRenderer !== 'undefined' && instancedRenderer.enabled;
        let mesh, hpBar;
        if (isMassSwarm) {
            mesh = new THREE.Object3D();
            mesh.scale.setScalar(stats.scale);
            mesh.position.set(basePos.x + offsetX, 0.75, basePos.z + offsetZ);
            mesh.userData = { velocity: new THREE.Vector3() };
            hpBar = null;
        } else {
            mesh = createDroneUnit(true, uType);
            mesh.scale.setScalar(stats.scale);
            mesh.position.set(basePos.x + offsetX, 0.75, basePos.z + offsetZ);
            hpBar = attachHealthBar(mesh, true, 0.7 * stats.scale);
            scene.add(mesh);
        }

        let simId = -1;
        if (typeof simWorld !== 'undefined') {
            const typeNum = (uType === 'standard') ? 0 : (uType === 'scout' ? 1 : (uType === 'tank' ? 2 : 3));
            simId = simWorld.spawn(0, typeNum, basePos.x + offsetX, basePos.z + offsetZ, stats.hp, stats.hp, stats.speed, stats.radius, stats.visionRange, stats.attackRange, stats.damage, stats.attackCooldown);
        }

        units.push({
            mesh: mesh,
            simId: simId,
            type: uType,
            selected: false,
            state: States.MOVE,
            personalTarget: new THREE.Vector3(enemyTargetPos.x, 0.75, enemyTargetPos.z),
            targetEnemy: null,
            hp: stats.hp,
            maxHp: stats.hp,
            speed: stats.speed,
            radius: stats.radius,
            visionRange: stats.visionRange,
            attackRange: stats.attackRange,
            attackCooldown: stats.attackCooldown,
            damage: stats.damage,
            lastAttackTime: 0,
            healthBar: hpBar,
            velocity: new THREE.Vector3(),
            abilityActive: false,
            abilityTimer: 0,
            lastAbilityTime: -99,
            isSieged: false,
            lastSiegeSwitch: -99,
            shield: 0,
            maxShield: 50,
            shieldTimer: 0
        });

        spawnedAllies++;
    }

    let spawnedEnemies = 0;
    const enemyTypes = ['standard', 'standard', 'scout', 'tank'];
    while (spawnedEnemies < enemyCount) {
        const cell = enemyCells[spawnedEnemies % enemyCells.length];
        const basePos = gridToWorld(cell.col, cell.row);
        const subSlot = Math.floor(spawnedEnemies / enemyCells.length);
        const angle = (spawnedEnemies * 2.39996) % (Math.PI * 2);
        const radius = Math.min(maxSpread, 0.15 * Math.sqrt(subSlot + 1));
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;

        const eType = enemyTypes[spawnedEnemies % enemyTypes.length];
        const stats = ENEMY_TYPES[eType] || ENEMY_TYPES.standard;
        const isMassSwarm = totalCount >= 1000 && typeof instancedRenderer !== 'undefined' && instancedRenderer.enabled;
        let mesh, hpBar;
        if (isMassSwarm) {
            mesh = new THREE.Object3D();
            mesh.scale.setScalar(stats.scale);
            mesh.position.set(basePos.x + offsetX, 0.75, basePos.z + offsetZ);
            mesh.userData = { velocity: new THREE.Vector3() };
            hpBar = null;
        } else {
            mesh = createDroneUnit(false, eType);
            mesh.scale.setScalar(stats.scale);
            mesh.position.set(basePos.x + offsetX, 0.75, basePos.z + offsetZ);
            hpBar = attachHealthBar(mesh, false, 0.7 * stats.scale);
            scene.add(mesh);
        }

        let simId = -1;
        if (typeof simWorld !== 'undefined') {
            const typeNum = (eType === 'standard') ? 0 : (eType === 'scout' ? 1 : (eType === 'tank' ? 2 : 3));
            simId = simWorld.spawn(1, typeNum, basePos.x + offsetX, basePos.z + offsetZ, stats.hp, stats.hp, stats.speed, stats.radius, stats.visionRange, stats.attackRange, stats.damage, stats.attackCooldown);
        }

        enemies.push({
            mesh: mesh,
            simId: simId,
            type: eType,
            state: States.MOVE,
            targetAlly: null,
            personalTarget: new THREE.Vector3(allyTargetPos.x, 0.75, allyTargetPos.z),
            hp: stats.hp,
            maxHp: stats.hp,
            speed: stats.speed,
            radius: stats.radius,
            visionRange: stats.visionRange,
            attackRange: stats.attackRange,
            attackCooldown: stats.attackCooldown,
            damage: stats.damage,
            lastAttackTime: 0,
            healthBar: hpBar,
            velocity: new THREE.Vector3(),
            isWaveUnit: true,
            sabotageNode: null
        });

        spawnedEnemies++;
    }

    if (typeof flowFieldGen !== 'undefined') {
        flowFieldGen.updateTarget(ENEMY_HQ_COL, ENEMY_HQ_ROW);
    }
    if (typeof enemyFlowFieldGen !== 'undefined') {
        enemyFlowFieldGen.updateTarget(HQ_COL, HQ_ROW);
    }
    if (typeof simWorkerPool !== 'undefined') {
        simWorkerPool.updateFlowFields(flowFieldGen, enemyFlowFieldGen);
    }

    if (typeof showTacticalAlert === 'function') {
        const msg = typeof t === 'function'
            ? t('ALERT_BENCH_START', allyCount, enemyCount, totalCount)
            : `🚀 СТРЕСС-ТЕСТ: Запущено ${allyCount} vs ${enemyCount} (${totalCount} всего)!`;
        showTacticalAlert(msg, false);
    }

    updateBenchmarkUI();
}

// Остановка стресс-теста и восстановление нормального игрового состояния
function stopBenchmark() {
    benchmarkActive = false;
    benchmarkTargetCount = 0;
    clearAllUnitsForBenchmark();

    // Восстанавливаем стартовый отряд
    if (typeof initStartingUnits === 'function') {
        initStartingUnits();
    }

    // Восстанавливаем нормальный интервал волн
    waveTimer = (typeof WAVE_INTERVAL !== 'undefined') ? WAVE_INTERVAL : 60;
    if (typeof waveWarningGiven !== 'undefined') {
        waveWarningGiven = false;
    }

    if (typeof showTacticalAlert === 'function') {
        const msg = typeof t === 'function'
            ? t('ALERT_BENCH_STOP')
            : '⏹️ Стресс-тест остановлен. Стандартный отряд восстановлен.';
        showTacticalAlert(msg, false);
    }

    updateBenchmarkUI();
}

// Проверка завершения битвы в стресс-тесте
function checkBenchmarkCompletion() {
    if (!benchmarkActive) return;
    if (units.length === 0 || enemies.length === 0) {
        const winner = units.length > 0
            ? (typeof t === 'function' ? t('BENCH_WIN_ALLIES') : 'Союзники')
            : (typeof t === 'function' ? t('BENCH_WIN_ENEMIES') : 'Враги');
        const avgFps = (typeof engineProfiler !== 'undefined' && engineProfiler.avgFps) ? Math.round(engineProfiler.avgFps) : 60;
        const msg = typeof t === 'function'
            ? t('ALERT_BENCH_WIN', winner, avgFps)
            : `🏁 Стресс-тест завершён! Победитель: ${winner}. Средний FPS: ${avgFps}`;
        if (typeof showTacticalAlert === 'function') {
            showTacticalAlert(msg, false);
        }
        stopBenchmark();
    }
}

// Переключение алгоритма коллизий: Spatial Grid O(N) vs Naive Brute-Force O(N²)
function toggleCollisionMode() {
    if (typeof spatialGrid === 'undefined') return;

    const isCurrentSpatial = (spatialGrid.collisionMode === 'spatial');
    spatialGrid.collisionMode = isCurrentSpatial ? 'naive' : 'spatial';

    if (typeof refreshProfilerToggles === 'function') refreshProfilerToggles();

    if (typeof showTacticalAlert === 'function') {
        if (spatialGrid.collisionMode === 'naive') {
            showTacticalAlert(typeof t === 'function' ? t('ALERT_COLL_NAIVE') : 'O(N²)', true);
        } else {
            showTacticalAlert(typeof t === 'function' ? t('ALERT_COLL_SPATIAL') : 'O(N)', false);
        }
    }
}

// Переключение GPU Instancing: THREE.InstancedMesh (<20 calls) vs Individual Meshes (12k calls)
function toggleInstancingMode() {
    if (typeof instancedRenderer === 'undefined') return;

    const totalUnits = units.length + enemies.length;
    if (instancedRenderer.enabled && totalUnits >= 1000) {
        if (typeof showTacticalAlert === 'function') {
            showTacticalAlert(typeof t === 'function' ? t('ALERT_BENCH_SWARM_INST') : '⚠️ Для армий от 1000 юнитов требуется GPU-инстансинг!', true);
        }
        return;
    }

    instancedRenderer.enabled = !instancedRenderer.enabled;
    if (typeof refreshProfilerToggles === 'function') refreshProfilerToggles();

    if (typeof showTacticalAlert === 'function') {
        showTacticalAlert(
            typeof t === 'function' ? t(instancedRenderer.enabled ? 'ALERT_INST_ON' : 'ALERT_INST_OFF') : '',
            false
        );
    }
}

function updateBenchmarkUI() {
    const statusEl = document.getElementById('dbg-bench-status');
    const stopBtn = document.getElementById('dbg-bench-stop-btn');
    if (statusEl) {
        statusEl.textContent = typeof t === 'function'
            ? (benchmarkActive ? t('DBG_BENCH_ON', benchmarkTargetCount) : t('DBG_BENCH_OFF'))
            : (benchmarkActive ? String(benchmarkTargetCount) : '—');
        statusEl.classList.toggle('is-warn', !!benchmarkActive);
    }
    if (stopBtn) {
        stopBtn.style.display = benchmarkActive ? '' : 'none';
    }
}
