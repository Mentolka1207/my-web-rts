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
        if (units[i].mesh) {
            scene.remove(units[i].mesh);
        }
    }
    units.length = 0;

    for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].mesh) {
            scene.remove(enemies[i].mesh);
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
}

// Запуск стресс-теста на N юнитов
function runBenchmark(count) {
    if (!gameStarted) {
        if (typeof startGame === 'function') startGame();
    }

    benchmarkActive = true;
    benchmarkTargetCount = count;
    clearAllUnitsForBenchmark();

    // Временно приостанавливаем волны, чтобы они не мешали чистоте эксперимента
    waveTimer = 99999;

    const halfCount = Math.floor(count / 2);
    const allyCount = halfCount;
    const enemyCount = count - halfCount;

    // Сетка размещения союзников (Северо-Запад карты, col: 2..7, row: 2..7)
    // Размещение в несколько эшелонов с плотным заполнением для штурма узких проходов
    const allyCols = [2, 3, 4, 5, 6, 7];
    const allyRows = [2, 3, 4, 5, 6, 7];
    let spawnedAllies = 0;

    const unitTypes = ['standard', 'standard', 'scout', 'standard', 'tank'];

    while (spawnedAllies < allyCount) {
        for (let rIdx = 0; rIdx < allyRows.length && spawnedAllies < allyCount; rIdx++) {
            for (let cIdx = 0; cIdx < allyCols.length && spawnedAllies < allyCount; cIdx++) {
                const c = allyCols[cIdx];
                const r = allyRows[rIdx];
                if (grid[r][c] === 1) continue;

                const basePos = gridToWorld(c, r);
                // Микро-смещение внутри клетки при спавне сотен юнитов
                const subSlot = Math.floor(spawnedAllies / (allyCols.length * allyRows.length));
                const offsetX = ((subSlot % 4) - 1.5) * 0.35;
                const offsetZ = (Math.floor(subSlot / 4) - 1.5) * 0.35;

                const uType = unitTypes[spawnedAllies % unitTypes.length];
                const stats = DRONE_TYPES[uType];
                const mesh = createDroneUnit(true, uType);
                mesh.scale.setScalar(stats.scale);
                mesh.position.set(basePos.x + offsetX, 0.75, basePos.z + offsetZ);
                const hpBar = attachHealthBar(mesh, true, 0.7 * stats.scale);

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
                    personalTarget: new THREE.Vector3(12, 0.75, 12), // Направление на вражескую половину через центр
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
        }
    }

    // Сетка размещения врагов (Юго-Восток карты, col: 14..19, row: 14..19)
    const enemyCols = [14, 15, 16, 17, 18, 19];
    const enemyRows = [14, 15, 16, 17, 18, 19];
    let spawnedEnemies = 0;
    const enemyTypes = ['standard', 'standard', 'scout', 'tank'];

    while (spawnedEnemies < enemyCount) {
        for (let rIdx = 0; rIdx < enemyRows.length && spawnedEnemies < enemyCount; rIdx++) {
            for (let cIdx = 0; cIdx < enemyCols.length && spawnedEnemies < enemyCount; cIdx++) {
                const c = enemyCols[cIdx];
                const r = enemyRows[rIdx];
                if (grid[r][c] === 1) continue;

                const basePos = gridToWorld(c, r);
                const subSlot = Math.floor(spawnedEnemies / (enemyCols.length * enemyRows.length));
                const offsetX = ((subSlot % 4) - 1.5) * 0.35;
                const offsetZ = (Math.floor(subSlot / 4) - 1.5) * 0.35;

                const eType = enemyTypes[spawnedEnemies % enemyTypes.length];
                const stats = ENEMY_TYPES[eType] || ENEMY_TYPES.standard;
                const mesh = createDroneUnit(false, eType);
                mesh.scale.setScalar(stats.scale);
                mesh.position.set(basePos.x + offsetX, 0.75, basePos.z + offsetZ);
                const hpBar = attachHealthBar(mesh, false, 0.7 * stats.scale);

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
                    personalTarget: new THREE.Vector3(-12, 0.75, -12), // Направление на союзную базу через узкие коридоры
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
        }
    }

    // Обновляем векторные поля: союзники идут на вражеский штаб, враги — на штаб игрока через узкие проходы
    if (typeof flowFieldGen !== 'undefined') {
        flowFieldGen.updateTarget(ENEMY_HQ_COL, ENEMY_HQ_ROW);
    }
    if (typeof enemyFlowFieldGen !== 'undefined') {
        enemyFlowFieldGen.updateTarget(HQ_COL, HQ_ROW);
    }

    if (typeof showTacticalAlert === 'function') {
        showTacticalAlert(`🚀 СТРЕСС-ТЕСТ: Запущено ${count} юнитов в узкие проходы карты!`, false);
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

    if (typeof showTacticalAlert === 'function') {
        showTacticalAlert('⏹️ Стресс-тест остановлен. Стандартный отряд восстановлен.', false);
    }

    updateBenchmarkUI();
}

// Переключение алгоритма коллизий: Spatial Grid O(N) vs Naive Brute-Force O(N²)
function toggleCollisionMode() {
    if (typeof spatialGrid === 'undefined') return;

    const isCurrentSpatial = (spatialGrid.collisionMode === 'spatial');
    spatialGrid.collisionMode = isCurrentSpatial ? 'naive' : 'spatial';

    const btn = document.getElementById('dbg-collision-btn');
    if (btn) {
        if (spatialGrid.collisionMode === 'spatial') {
            btn.textContent = '⬡ Spatial Grid O(N)';
            btn.className = 'dbg-toggle-btn spatial';
            btn.title = 'Оптимальный алгоритм O(N) на базе хеш-сетки';
        } else {
            btn.textContent = '⚠️ Naive Brute O(N²)';
            btn.className = 'dbg-toggle-btn naive';
            btn.title = 'Наивный квадратичный перебор всех пар (резкое падение FPS)';
        }
    }

    if (typeof showTacticalAlert === 'function') {
        if (spatialGrid.collisionMode === 'naive') {
            showTacticalAlert('⚠️ РЕЖИМ КОЛЛИЗИЙ: O(N²) Наивный перебор! Ожидается сильная просадка FPS.', true);
        } else {
            showTacticalAlert('⬡ РЕЖИМ КОЛЛИЗИЙ: O(N) Spatial Hashing активирован.', false);
        }
    }
}

// Переключение GPU Instancing: THREE.InstancedMesh (<20 calls) vs Individual Meshes (12k calls)
function toggleInstancingMode() {
    if (typeof instancedRenderer === 'undefined') return;

    instancedRenderer.enabled = !instancedRenderer.enabled;
    const btn = document.getElementById('dbg-instancing-btn');

    if (btn) {
        if (instancedRenderer.enabled) {
            btn.textContent = '⚡ GPU Instancing: ВКЛ (~16 calls)';
            btn.className = 'dbg-toggle-btn instanced';
            btn.title = 'Отрисовка всех юнитов и полосок HP через единые InstancedMesh';
        } else {
            btn.textContent = '🐌 Individual Meshes: ВЫКЛ (12k calls)';
            btn.className = 'dbg-toggle-btn individual';
            btn.title = 'Индивидуальные меши для каждого юнита (просадка по Draw Calls)';
        }
    }

    if (typeof showTacticalAlert === 'function') {
        showTacticalAlert(
            instancedRenderer.enabled
                ? '⚡ GPU Instancing включён! Draw calls сокращены до минимума (~16).'
                : '🐌 Индивидуальные меши включены (резкий рост Draw Calls и падение FPS).',
            false
        );
    }
}

function updateBenchmarkUI() {
    const statusEl = document.getElementById('dbg-bench-status');
    const stopBtn = document.getElementById('dbg-bench-stop-btn');
    if (statusEl) {
        if (benchmarkActive) {
            statusEl.textContent = `АКТИВЕН (${benchmarkTargetCount} юн.)`;
            statusEl.style.color = '#ff9900';
        } else {
            statusEl.textContent = 'ВЫКЛ';
            statusEl.style.color = '#94a3b8';
        }
    }
    if (stopBtn) {
        stopBtn.style.display = benchmarkActive ? 'inline-block' : 'none';
    }
}
