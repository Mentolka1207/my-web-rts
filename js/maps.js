// =============================================================================
// js/maps.js — Карты как чистые данные (MapDef v2) и пресеты сложности
// Поддержка тактического выбора арены, валидация данных и инвариантов
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
        schema: 2,
        id: 'canyon',
        nameKey: 'MAP_CANYON',
        size: 22,
        rows: [
            "######################",
            "##...............#...#",
            "#....................#",
            "#............#......##",
            "#....................#",
            "#..##.............##.#",
            "#..........#..#......#",
            "#.............#......#",
            "#..................#.#",
            "#.....#...#..........#",
            "#...............#....#",
            "#..................#.#",
            "#......#.............#",
            "#.........#....#.....#",
            "#.#..................#",
            "#....................#",
            "#......#.......#.....#",
            "#....................#",
            "#..#.................#",
            "#....................#",
            "#............#......##",
            "######################"
        ],
        playerHQ:    { col: 1,  row: 1  },
        enemyHQ:     { col: 20, row: 20 },
        playerSpawn: { col: 3,  row: 3  },
        nodes: [
            { id: 'alpha',  nameKey: 'NODE_ALPHA',  col: 16, row: 5  },
            { id: 'center', nameKey: 'NODE_CENTER', col: 11, row: 11 },
            { id: 'beta',   nameKey: 'NODE_BETA',   col: 5,  row: 16 }
        ],
        recommended: { difficulty: 'normal' }
    },

    arena: {
        schema: 2,
        id: 'arena',
        nameKey: 'MAP_ARENA',
        size: 22,
        rows: [
            "######################",
            "##...................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....###.............#",
            "#....#.#.............#",
            "#....###.......###...#",
            "#..........#.........#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#..........#.........#",
            "#....................#",
            "#......#.......###...#",
            "#......#.......#.#...#",
            "#......#.......###...#",
            "#....................#",
            "#....................#",
            "#...................##",
            "######################"
        ],
        playerHQ:    { col: 1,  row: 1  },
        enemyHQ:     { col: 20, row: 20 },
        playerSpawn: { col: 3,  row: 3  },
        nodes: [
            { id: 'alpha',  nameKey: 'NODE_ALPHA',  col: 16, row: 5  },
            { id: 'center', nameKey: 'NODE_CENTER', col: 11, row: 11 },
            { id: 'beta',   nameKey: 'NODE_BETA',   col: 5,  row: 16 }
        ],
        recommended: { difficulty: 'normal' }
    },

    maze: {
        schema: 2,
        id: 'maze',
        nameKey: 'MAP_MAZE',
        size: 22,
        rows: [
            "######################",
            "##...................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#...####.####.####...#",
            "#.....#........#.....#",
            "#.....#........#.....#",
            "#....................#",
            "#....................#",
            "#.....#........#.....#",
            "#.....#........#.....#",
            "#...####.####.####...#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#....................#",
            "#...................##",
            "######################"
        ],
        playerHQ:    { col: 1,  row: 1  },
        enemyHQ:     { col: 20, row: 20 },
        playerSpawn: { col: 3,  row: 3  },
        nodes: [
            { id: 'alpha',  nameKey: 'NODE_ALPHA',  col: 16, row: 5  },
            { id: 'center', nameKey: 'NODE_CENTER', col: 11, row: 11 },
            { id: 'beta',   nameKey: 'NODE_BETA',   col: 5,  row: 16 }
        ],
        recommended: { difficulty: 'hard' }
    },

    crossroads: {
        schema: 2,
        id: 'crossroads',
        nameKey: 'MAP_CROSSROADS',
        size: 22,
        rows: [
            "######################",
            "##...................#",
            "#....................#",
            "#....................#",
            "#.........#.#........#",
            "#....................#",
            "#.......###.###......#",
            "#....................#",
            "#.....#.........#....#",
            "#.....#.........#....#",
            "#...#.#.........#.#..#",
            "#....................#",
            "#...#.#.........#.#..#",
            "#.....#.........#....#",
            "#.....#.........#....#",
            "#....................#",
            "#.......###.###......#",
            "#....................#",
            "#.........#.#........#",
            "#....................#",
            "#...................##",
            "######################"
        ],
        playerHQ:    { col: 1,  row: 1  },
        enemyHQ:     { col: 20, row: 20 },
        playerSpawn: { col: 3,  row: 3  },
        nodes: [
            { id: 'alpha',  nameKey: 'NODE_ALPHA',  col: 17, row: 4  },
            { id: 'center', nameKey: 'NODE_CENTER', col: 11, row: 11 },
            { id: 'beta',   nameKey: 'NODE_BETA',   col: 4,  row: 17 }
        ],
        recommended: { difficulty: 'normal' }
    }
};

// Для обратной совместимости добавляем generateGrid к пресетам
Object.values(MAP_CATALOG).forEach(mapDef => {
    mapDef.generateGrid = function(gridArray) {
        for (let r = 0; r < mapDef.size; r++) {
            const rowStr = mapDef.rows[r];
            for (let c = 0; c < mapDef.size; c++) {
                gridArray[r][c] = (rowStr && rowStr[c] === '#') ? 1 : 0;
            }
        }
    };
});

/**
 * Валидатор контракта и инвариантов карты (MapDef v2)
 * Проверяет схему данных, границы, чистоту зон вокруг HQ и кристаллов, а также BFS-достижимость
 * @param {object} def 
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateMapDef(def) {
    const errors = [];
    if (!def || typeof def !== 'object') {
        return { ok: false, errors: ['MapDef must be an object'] };
    }

    if (def.schema !== 2) {
        errors.push(`Invalid schema: expected 2, got ${def.schema}`);
    }

    if (!def.id || typeof def.id !== 'string' || !/^[a-z0-9-]+$/.test(def.id)) {
        errors.push(`Invalid id: "${def.id}", must match [a-z0-9-]+`);
    }

    if (!def.nameKey || typeof def.nameKey !== 'string') {
        errors.push('Missing or invalid nameKey');
    } else if (typeof TRANSLATIONS !== 'undefined') {
        if (!TRANSLATIONS.ru || !TRANSLATIONS.ru[def.nameKey]) {
            errors.push(`nameKey "${def.nameKey}" missing in TRANSLATIONS.ru`);
        }
        if (!TRANSLATIONS.en || !TRANSLATIONS.en[def.nameKey]) {
            errors.push(`nameKey "${def.nameKey}" missing in TRANSLATIONS.en`);
        }
    }

    const expectedSize = (typeof GRID_SIZE !== 'undefined') ? GRID_SIZE : 22;
    if (def.size !== expectedSize) {
        errors.push(`Invalid size: expected ${expectedSize}, got ${def.size}`);
    }

    if (!Array.isArray(def.rows) || def.rows.length !== expectedSize) {
        errors.push(`rows must be an array of length ${expectedSize}`);
    } else {
        for (let r = 0; r < expectedSize; r++) {
            const row = def.rows[r];
            if (typeof row !== 'string' || row.length !== expectedSize) {
                errors.push(`Row ${r} must be a string of length ${expectedSize}`);
                break;
            }
            if (!/^[#.]+$/.test(row)) {
                errors.push(`Row ${r} contains invalid characters (only # and . allowed)`);
                break;
            }
        }

        // Периметр карты обязан состоять из стен (#)
        for (let c = 0; c < expectedSize; c++) {
            if (def.rows[0][c] !== '#' || def.rows[expectedSize - 1][c] !== '#') {
                errors.push('Top and bottom borders must be completely filled with walls (#)');
                break;
            }
        }
        for (let r = 0; r < expectedSize; r++) {
            if (def.rows[r][0] !== '#' || def.rows[r][expectedSize - 1] !== '#') {
                errors.push('Left and right borders must be completely filled with walls (#)');
                break;
            }
        }
    }

    const checkCell = (cell, label) => {
        if (!cell || typeof cell.col !== 'number' || typeof cell.row !== 'number' ||
            cell.col <= 0 || cell.col >= expectedSize - 1 ||
            cell.row <= 0 || cell.row >= expectedSize - 1) {
            errors.push(`Invalid coordinates for ${label}`);
            return false;
        }
        return true;
    };

    checkCell(def.playerHQ, 'playerHQ');
    checkCell(def.enemyHQ, 'enemyHQ');
    checkCell(def.playerSpawn, 'playerSpawn');

    // Проверка ресурсных точек
    if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
        errors.push('nodes must be a non-empty array');
    } else {
        const nodeIds = new Set();
        def.nodes.forEach((n, idx) => {
            if (!n.id || !/^[a-z0-9-]+$/.test(n.id)) {
                errors.push(`Node [${idx}] has invalid id`);
            } else if (nodeIds.has(n.id)) {
                errors.push(`Duplicate node id: "${n.id}"`);
            } else {
                nodeIds.add(n.id);
            }

            if (!n.nameKey || typeof n.nameKey !== 'string') {
                errors.push(`Node [${idx}] missing nameKey`);
            } else if (typeof TRANSLATIONS !== 'undefined') {
                if (!TRANSLATIONS.ru || !TRANSLATIONS.ru[n.nameKey]) {
                    errors.push(`Node nameKey "${n.nameKey}" missing in TRANSLATIONS.ru`);
                }
                if (!TRANSLATIONS.en || !TRANSLATIONS.en[n.nameKey]) {
                    errors.push(`Node nameKey "${n.nameKey}" missing in TRANSLATIONS.en`);
                }
            }
            checkCell(n, `node[${idx}]`);

            // Зона 3x3 вокруг кристалла должна быть свободна (.)
            if (Array.isArray(def.rows) && def.rows.length === expectedSize) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = n.row + dr, nc = n.col + dc;
                        if (nr > 0 && nr < expectedSize - 1 && nc > 0 && nc < expectedSize - 1) {
                            if (def.rows[nr][nc] !== '.') {
                                errors.push(`Node "${n.id}" 3x3 zone blocked at (${nc}, ${nr})`);
                            }
                        }
                    }
                }
            }
        });
    }

    // Проверка связности и достижимости (BFS)
    if (errors.length === 0) {
        const visited = Array.from({ length: expectedSize }, () => Array(expectedSize).fill(false));
        const queue = [{ col: def.playerSpawn.col, row: def.playerSpawn.row }];
        visited[def.playerSpawn.row][def.playerSpawn.col] = true;

        const targets = new Set();
        def.nodes.forEach(n => targets.add(`${n.col},${n.row}`));

        const enemyNeighbors = [
            { col: def.enemyHQ.col - 1, row: def.enemyHQ.row },
            { col: def.enemyHQ.col, row: def.enemyHQ.row - 1 },
            { col: def.enemyHQ.col + 1, row: def.enemyHQ.row },
            { col: def.enemyHQ.col, row: def.enemyHQ.row + 1 }
        ].filter(pt => pt.col > 0 && pt.col < expectedSize - 1 && pt.row > 0 && pt.row < expectedSize - 1 && def.rows[pt.row][pt.col] === '.');

        let reachedEnemyHQ = false;

        while (queue.length > 0) {
            const cur = queue.shift();
            targets.delete(`${cur.col},${cur.row}`);
            if (enemyNeighbors.some(en => en.col === cur.col && en.row === cur.row)) {
                reachedEnemyHQ = true;
            }

            const deltas = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];
            for (const d of deltas) {
                const nc = cur.col + d.col, nr = cur.row + d.row;
                if (nc > 0 && nc < expectedSize - 1 && nr > 0 && nr < expectedSize - 1) {
                    if (!visited[nr][nc] && def.rows[nr][nc] === '.') {
                        visited[nr][nc] = true;
                        queue.push({ col: nc, row: nr });
                    }
                }
            }
        }

        if (targets.size > 0) {
            errors.push(`Unreachable resource nodes from playerSpawn: ${Array.from(targets).join('; ')}`);
        }
        if (!reachedEnemyHQ) {
            errors.push('Enemy HQ is not reachable from playerSpawn');
        }
    }

    return {
        ok: errors.length === 0,
        errors: errors
    };
}

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
    const mapDef = (typeof mapId === 'object' && mapId !== null) ? mapId : (MAP_CATALOG[mapId] || MAP_CATALOG.canyon);

    // 1. Устанавливаем координаты баз и спавна из контракта карты
    if (mapDef.playerHQ) {
        HQ_COL = mapDef.playerHQ.col;
        HQ_ROW = mapDef.playerHQ.row;
    }
    if (mapDef.enemyHQ) {
        ENEMY_HQ_COL = mapDef.enemyHQ.col;
        ENEMY_HQ_ROW = mapDef.enemyHQ.row;
    }
    if (mapDef.playerSpawn) {
        BASE_COL = mapDef.playerSpawn.col;
        BASE_ROW = mapDef.playerSpawn.row;
    }

    // Обновляем список координат ресурсных точек
    if (Array.isArray(mapDef.nodes)) {
        RESOURCE_NODE_COORDS = mapDef.nodes.map(n => ({
            col: n.col,
            row: n.row,
            name: (typeof t === 'function') ? t(n.nameKey) : (n.name || n.id)
        }));
    }

    // 2. Заполняем сетку проходимости напрямую из запечённых строк MapDef
    for (let r = 0; r < GRID_SIZE; r++) {
        const rowStr = mapDef.rows[r];
        for (let c = 0; c < GRID_SIZE; c++) {
            grid[r][c] = (rowStr && rowStr[c] === '#') ? 1 : 0;
        }
    }

    // Гарантируем непроходимость клеток штабов
    grid[HQ_ROW][HQ_COL] = 1;
    grid[ENEMY_HQ_ROW][ENEMY_HQ_COL] = 1;

    // 3. Синхронизируем 3D-позиции баз и ресурсов в Three.js сцене
    if (typeof playerHQ !== 'undefined' && playerHQ && playerHQ.mesh && typeof gridToWorld === 'function') {
        const pPos = gridToWorld(HQ_COL, HQ_ROW);
        playerHQ.mesh.position.set(pPos.x, 0, pPos.z);
    }
    if (typeof enemyHQ !== 'undefined' && enemyHQ && enemyHQ.mesh && typeof gridToWorld === 'function') {
        const ePos = gridToWorld(ENEMY_HQ_COL, ENEMY_HQ_ROW);
        enemyHQ.mesh.position.set(ePos.x, 0, ePos.z);
    }
    if (typeof resourceNodes !== 'undefined' && Array.isArray(resourceNodes) && typeof gridToWorld === 'function') {
        mapDef.nodes.forEach((n, idx) => {
            if (resourceNodes[idx]) {
                const node = resourceNodes[idx];
                node.col = n.col;
                node.row = n.row;
                const wp = gridToWorld(n.col, n.row);
                node.pos.set(wp.x, 0, wp.z);
                node.group.position.set(wp.x, 0, wp.z);
                node.name = (typeof t === 'function') ? t(n.nameKey) : (n.name || n.id);
            }
        });
    }

    // 4. Перестраиваем Three.js InstancedMesh стен арены
    if (typeof buildInstancedWalls === 'function') {
        buildInstancedWalls();
    }

    // 5. Обновляем оффскрин-кэш статических препятствий миникарты
    if (typeof initStaticMinimap === 'function') {
        initStaticMinimap();
    }

    // 6. Пересчитываем глобальные Flow Fields для союзников и врагов
    if (typeof flowFieldGen !== 'undefined') {
        flowFieldGen.updateTarget(ENEMY_HQ_COL, ENEMY_HQ_ROW);
    }
    if (typeof enemyFlowFieldGen !== 'undefined') {
        enemyFlowFieldGen.updateTarget(HQ_COL, HQ_ROW);
    }
}
