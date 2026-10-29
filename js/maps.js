// =============================================================================
// js/maps.js — Карты как данные и пресеты сложности
// Поддержка тактического выбора арены и баланса сложности
// =============================================================================

const DIFFICULTY_CONFIGS = {
    easy: {
        id: 'easy',
        allyHpMult: 1.2,
        enemyHpMult: 0.8,
        enemyDamageMult: 0.8,
        waveInterval: 70,
        passiveIncome: 7
    },
    normal: {
        id: 'normal',
        allyHpMult: 1.0,
        enemyHpMult: 1.0,
        enemyDamageMult: 1.0,
        waveInterval: 60,
        passiveIncome: 5
    },
    hard: {
        id: 'hard',
        allyHpMult: 0.9,
        enemyHpMult: 1.25,
        enemyDamageMult: 1.25,
        waveInterval: 48,
        passiveIncome: 4
    }
};

let currentDifficulty = 'normal';
let currentMapId = 'canyon';

const MAP_CATALOG = {
    canyon: {
        id: 'canyon',
        nameKey: 'MAP_CANYON',
        generateGrid: function(gridArray) {
            // Рассеянные монолиты по сиду
            if (typeof rtsPRNG !== 'undefined' && rtsPRNG.setSeed) {
                rtsPRNG.setSeed(4242);
            }
            for (let i = 0; i < 25; i++) {
                const rx = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.int(1, GRID_SIZE - 2) : Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                const rz = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.int(1, GRID_SIZE - 2) : Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                if ((rx > 4 || rz > 4) && (rx < GRID_SIZE - 5 || rz < GRID_SIZE - 5) && gridArray[rz][rx] === 0) {
                    gridArray[rz][rx] = 1;
                }
            }
        }
    },

    arena: {
        id: 'arena',
        nameKey: 'MAP_ARENA',
        generateGrid: function(gridArray) {
            // 4 укрепленных угловых бастиона (бункера) с амбразурами
            const bastions = [
                { r: 5, c: 5 },
                { r: 5, c: 15 },
                { r: 15, c: 5 },
                { r: 15, c: 15 }
            ];

            bastions.forEach(b => {
                for (let dr = 0; dr <= 2; dr++) {
                    for (let dc = 0; dc <= 2; dc++) {
                        if (dr === 1 && dc === 1) continue; // внутренний дворик
                        const r = b.r + dr;
                        const c = b.c + dc;
                        if (r > 1 && r < GRID_SIZE - 2 && c > 1 && c < GRID_SIZE - 2) {
                            gridArray[r][c] = 1;
                        }
                    }
                }
            });

            // Небольшие тактические щиты в центре
            gridArray[8][11] = 1;
            gridArray[13][11] = 1;
        }
    },

    maze: {
        id: 'maze',
        nameKey: 'MAP_MAZE',
        generateGrid: function(gridArray) {
            // Извилистые коридоры и узкие тактические проходы
            // Горизонтальные и вертикальные сегменты стен
            for (let c = 4; c <= 17; c++) {
                if (c !== 8 && c !== 13) gridArray[7][c] = 1;
            }
            for (let c = 4; c <= 17; c++) {
                if (c !== 8 && c !== 13) gridArray[14][c] = 1;
            }
            for (let r = 8; r <= 13; r++) {
                if (r !== 10 && r !== 11) {
                    gridArray[r][6] = 1;
                    gridArray[r][15] = 1;
                }
            }
        }
    }
};

function setDifficulty(diffId, persist = true) {
    if (!DIFFICULTY_CONFIGS[diffId]) diffId = 'normal';
    currentDifficulty = diffId;
    if (persist && typeof playerSettings !== 'undefined') {
        playerSettings.difficulty = diffId;
        if (typeof saveSettingsToStorage === 'function') saveSettingsToStorage();
    }
    const selectEl = document.getElementById('difficulty-select');
    if (selectEl) selectEl.value = diffId;
}

function selectMap(mapId, persist = true) {
    if (!MAP_CATALOG[mapId]) mapId = 'canyon';
    currentMapId = mapId;
    if (persist && typeof playerSettings !== 'undefined') {
        playerSettings.mapId = mapId;
        if (typeof saveSettingsToStorage === 'function') saveSettingsToStorage();
    }
    const selectEl = document.getElementById('map-select');
    if (selectEl) selectEl.value = mapId;
}

function applyMapToGrid(mapId) {
    const mapDef = MAP_CATALOG[mapId] || MAP_CATALOG.canyon;

    // 1. Очищаем сетку
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            grid[r][c] = 0;
        }
    }

    // 2. Внешние защитные стены
    for (let i = 0; i < GRID_SIZE; i++) {
        grid[0][i] = 1;
        grid[GRID_SIZE - 1][i] = 1;
        grid[i][0] = 1;
        grid[i][GRID_SIZE - 1] = 1;
    }

    // 3. Генерация внутренних препятствий карты
    mapDef.generateGrid(grid);

    // 4. Очистка зон вокруг ресурсных кристаллов
    RESOURCE_NODE_COORDS.forEach(pt => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const r = pt.row + dr, c = pt.col + dc;
                if (r > 0 && r < GRID_SIZE - 1 && c > 0 && c < GRID_SIZE - 1) {
                    grid[r][c] = 0;
                }
            }
        }
    });

    // 5. Очистка клеток вокруг штабов
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const r1 = HQ_ROW + dr, c1 = HQ_COL + dc;
            if (r1 > 0 && r1 < GRID_SIZE - 1 && c1 > 0 && c1 < GRID_SIZE - 1) grid[r1][c1] = 0;
            const r2 = ENEMY_HQ_ROW + dr, c2 = ENEMY_HQ_COL + dc;
            if (r2 > 0 && r2 < GRID_SIZE - 1 && c2 > 0 && c2 < GRID_SIZE - 1) grid[r2][c2] = 0;
        }
    }

    // Сами ячейки штабов непроходимы
    grid[HQ_ROW][HQ_COL] = 1;
    grid[ENEMY_HQ_ROW][ENEMY_HQ_COL] = 1;

    // 6. Перестраиваем Three.js InstancedMesh стены
    if (typeof buildInstancedWalls === 'function') {
        buildInstancedWalls();
    }

    // 7. Обновляем оффскрин-кэш миникарты
    if (typeof initStaticMinimap === 'function') {
        initStaticMinimap();
    }

    // 8. Пересчитываем Flow Fields
    if (typeof flowFieldGen !== 'undefined') {
        flowFieldGen.updateTarget(ENEMY_HQ_COL, ENEMY_HQ_ROW);
    }
    if (typeof enemyFlowFieldGen !== 'undefined') {
        enemyFlowFieldGen.updateTarget(HQ_COL, HQ_ROW);
    }
}
