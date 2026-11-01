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

    const expectedSize = (typeof def.size === 'number' && [22, 64, 128, 256].includes(def.size))
        ? def.size
        : ((typeof GRID_SIZE !== 'undefined') ? GRID_SIZE : 22);
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

let currentMapSize = null;
let currentMapSeed = Math.floor(Math.random() * 900000) + 100000;
let isCustomSeed = false;

function getMapSeed() {
    return currentMapSeed;
}

function setMapSeed(newSeed, rerender = true) {
    if (typeof newSeed === 'string') {
        const trimmed = newSeed.trim();
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed) && String(parsed) === trimmed) {
            currentMapSeed = parsed;
        } else if (trimmed.length > 0) {
            let h = 0;
            for (let i = 0; i < trimmed.length; i++) {
                h = (Math.imul(31, h) + trimmed.charCodeAt(i)) | 0;
            }
            currentMapSeed = Math.abs(h);
        }
    } else if (typeof newSeed === 'number' && !isNaN(newSeed)) {
        currentMapSeed = Math.floor(newSeed);
    }
    isCustomSeed = true;
    syncSeedUI();
    if (rerender && typeof applyMapToGrid === 'function' && typeof currentMapId !== 'undefined') {
        applyMapToGrid(currentMapId);
    }
}

function rerollMapSeed(rerender = true) {
    currentMapSeed = Math.floor(Math.random() * 900000) + 100000;
    isCustomSeed = false;
    syncSeedUI();
    if (rerender && typeof applyMapToGrid === 'function' && typeof currentMapId !== 'undefined') {
        applyMapToGrid(currentMapId);
    }
    return currentMapSeed;
}

function syncSeedUI() {
    if (typeof document === 'undefined') return;
    const input = document.getElementById('map-seed-input');
    if (input && document.activeElement !== input) {
        input.value = String(currentMapSeed);
    }
}

/**
 * Конфигурации процедурных биомов для генерации препятствий через шум Перлина
 */
const PERLIN_BIOME_CONFIGS = {
    canyon: {
        id: 'canyon',
        generator: (perlin, u, v, N) => {
            const mainAxis = (u + v) * 0.7071;
            const crossAxis = (u - v) * 0.7071;
            const n = perlin.fbm2D(mainAxis * 2.8, crossAxis * 9.5, { octaves: 2, scale: 1.0 });
            return Math.abs(n) > 0.35;
        }
    },
    arena: {
        id: 'arena',
        generator: (perlin, u, v, N) => {
            const n = perlin.fbm2D(u * 5.2, v * 5.2, { octaves: 2, scale: 1.0 });
            return n > 0.36;
        }
    },
    maze: {
        id: 'maze',
        generator: (perlin, u, v, N) => {
            const n = perlin.fbm2D(u * 8.5, v * 8.5, { octaves: 3, scale: 1.0 });
            return Math.abs(n) < 0.085;
        }
    },
    crossroads: {
        id: 'crossroads',
        generator: (perlin, u, v, N) => {
            const centerDistH = Math.abs(v - 0.5) * N;
            const centerDistV = Math.abs(u - 0.5) * N;
            if (centerDistH <= 2.2 || centerDistV <= 2.2) return false;
            const n = perlin.fbm2D(u * 6.0, v * 6.0, { octaves: 2, scale: 1.0 });
            return n > 0.28;
        }
    }
};

function setMapSize(sizeId, persist = true) {
    if (typeof MAP_SIZE_CONFIGS === 'undefined' || !MAP_SIZE_CONFIGS[sizeId]) sizeId = '256';
    currentMapSize = sizeId;
    if (persist && typeof playerSettings !== 'undefined') {
        playerSettings.mapSize = sizeId;
        if (typeof saveSettingsToStorage === 'function') saveSettingsToStorage();
    }
    const selectEl = document.getElementById('map-size-select');
    if (selectEl) selectEl.value = sizeId;

    if (typeof applyMapToGrid === 'function' && typeof currentMapId !== 'undefined') {
        applyMapToGrid(currentMapId);
    }
}

/**
 * Создаёт масштабированную версию базовой карты MapDef под целевой размер сетки (64x64 для 256, 128x128 для 512, 256x256 для 1024)
 * Генерирует ландшафт по алгоритму Шума Перлина (Perlin Noise FBM) с учётом биома карты.
 * Гарантирует:
 * - Стенной периметр по краям (#)
 * - Чистые зоны вокруг баз (радиус 4) и кристаллов (3x3)
 * - 100% BFS-достижимость всех ресурсных точек и вражеского штаба (с авто-пробитием коридоров)
 */
function buildScaledMap(baseMapDef, sizeId, seed = currentMapSeed) {
    const sizeConfig = (typeof MAP_SIZE_CONFIGS !== 'undefined' && MAP_SIZE_CONFIGS[sizeId])
        ? MAP_SIZE_CONFIGS[sizeId]
        : (typeof MAP_SIZE_CONFIGS !== 'undefined' ? MAP_SIZE_CONFIGS['256'] : { gridSize: 64, worldSize: 256, cellSize: 4 });

    const N = sizeConfig.gridSize;
    const baseSize = baseMapDef.size;
    const activeSeed = (typeof seed !== 'undefined' && seed !== null) ? seed : currentMapSeed;

    const playerHQ = { col: 2, row: 2 };
    const playerSpawn = { col: 4, row: 4 };
    const enemyHQ = { col: N - 3, row: N - 3 };

    const nodes = [
        { id: 'alpha',  nameKey: 'NODE_ALPHA',  col: Math.round(N * 0.75), row: Math.round(N * 0.25) },
        { id: 'center', nameKey: 'NODE_CENTER', col: Math.floor(N * 0.5),  row: Math.floor(N * 0.5) },
        { id: 'beta',   nameKey: 'NODE_BETA',   col: Math.round(N * 0.25), row: Math.round(N * 0.75) }
    ];

    if (Array.isArray(sizeConfig.extraNodes)) {
        sizeConfig.extraNodes.forEach(extra => {
            nodes.push({
                id: extra.id,
                nameKey: extra.nameKey,
                col: Math.round(N * extra.u),
                row: Math.round(N * extra.v)
            });
        });
    }

    const grid2D = Array.from({ length: N }, () => Array(N).fill('.'));

    for (let i = 0; i < N; i++) {
        grid2D[0][i] = '#';
        grid2D[N - 1][i] = '#';
        grid2D[i][0] = '#';
        grid2D[i][N - 1] = '#';
    }

    // Процедурная генерация препятствий по алгоритму шума Перлина
    const biome = PERLIN_BIOME_CONFIGS[baseMapDef.id] || PERLIN_BIOME_CONFIGS.canyon;
    const pNoise = (typeof PerlinNoise !== 'undefined') ? new PerlinNoise(activeSeed) : null;

    if (pNoise && typeof biome.generator === 'function') {
        for (let r = 1; r < N - 1; r++) {
            const v = r / N;
            for (let c = 1; c < N - 1; c++) {
                const u = c / N;
                if (biome.generator(pNoise, u, v, N)) {
                    grid2D[r][c] = '#';
                }
            }
        }
    } else {
        // Резервный фолбэк: интерполяция строк базовой карты
        for (let r = 1; r < N - 1; r++) {
            const v = (r - 1) / (N - 3);
            const baseR = Math.min(baseSize - 2, Math.max(1, 1 + Math.round(v * (baseSize - 3))));
            const rowStr = baseMapDef.rows[baseR];

            for (let c = 1; c < N - 1; c++) {
                const u = (c - 1) / (N - 3);
                const baseC = Math.min(baseSize - 2, Math.max(1, 1 + Math.round(u * (baseSize - 3))));
                if (rowStr && rowStr[baseC] === '#') {
                    grid2D[r][c] = '#';
                }
            }
        }
    }

    // Очистка зон вокруг штабов
    for (let dr = -4; dr <= 4; dr++) {
        for (let dc = -4; dc <= 4; dc++) {
            if (dr * dr + dc * dc <= 18) {
                const pr = playerHQ.row + dr, pc = playerHQ.col + dc;
                if (pr > 0 && pr < N - 1 && pc > 0 && pc < N - 1) grid2D[pr][pc] = '.';
                const er = enemyHQ.row + dr, ec = enemyHQ.col + dc;
                if (er > 0 && er < N - 1 && ec > 0 && ec < N - 1) grid2D[er][ec] = '.';
            }
        }
    }

    // Очистка зоны вокруг спавна
    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            const sr = playerSpawn.row + dr, sc = playerSpawn.col + dc;
            if (sr > 0 && sr < N - 1 && sc > 0 && sc < N - 1) grid2D[sr][sc] = '.';
        }
    }

    // Очистка 3x3 зон вокруг кристаллов
    nodes.forEach(n => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = n.row + dr, nc = n.col + dc;
                if (nr > 0 && nr < N - 1 && nc > 0 && nc < N - 1) grid2D[nr][nc] = '.';
            }
        }
    });

    // Функция пробития 2-клеточного коридора между точками (на случай блокировки)
    function carveCorridor(x0, y0, x1, y1) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
        if (steps === 0) return;
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const cx = Math.round(x0 + (x1 - x0) * t);
            const cy = Math.round(y0 + (y1 - y0) * t);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx > 0 && nx < N - 1 && ny > 0 && ny < N - 1) {
                        grid2D[ny][nx] = '.';
                    }
                }
            }
        }
    }

    // Проверка связности (BFS)
    const visited = new Uint8Array(N * N);
    const queue = new Int32Array(N * N);
    let head = 0, tail = 0;

    const startIdx = playerSpawn.row * N + playerSpawn.col;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;

    while (head < tail) {
        const cur = queue[head++];
        const cc = cur % N;
        const cr = (cur / N) | 0;

        if (cc > 1 && !visited[cur - 1] && grid2D[cr][cc - 1] === '.') { visited[cur - 1] = 1; queue[tail++] = cur - 1; }
        if (cc < N - 2 && !visited[cur + 1] && grid2D[cr][cc + 1] === '.') { visited[cur + 1] = 1; queue[tail++] = cur + 1; }
        if (cr > 1 && !visited[cur - N] && grid2D[cr - 1][cc] === '.') { visited[cur - N] = 1; queue[tail++] = cur - N; }
        if (cr < N - 2 && !visited[cur + N] && grid2D[cr + 1][cc] === '.') { visited[cur + N] = 1; queue[tail++] = cur + N; }
    }

    nodes.forEach(n => {
        if (!visited[n.row * N + n.col]) {
            carveCorridor(playerSpawn.col, playerSpawn.row, n.col, n.row);
        }
    });

    const enemyNear = [
        { col: enemyHQ.col - 1, row: enemyHQ.row },
        { col: enemyHQ.col, row: enemyHQ.row - 1 }
    ];
    const canReachEnemy = enemyNear.some(p => visited[p.row * N + p.col]);
    if (!canReachEnemy) {
        carveCorridor(playerSpawn.col, playerSpawn.row, enemyHQ.col - 1, enemyHQ.row - 1);
    }

    // Повторно очищаем 3x3 зону кристаллов после пробития коридоров
    nodes.forEach(n => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = n.row + dr, nc = n.col + dc;
                if (nr > 0 && nr < N - 1 && nc > 0 && nc < N - 1) grid2D[nr][nc] = '.';
            }
        }
    });

    return {
        schema: 2,
        id: `${baseMapDef.id}-${sizeId}`,
        nameKey: baseMapDef.nameKey,
        size: N,
        rows: grid2D.map(r => r.join('')),
        playerHQ,
        enemyHQ,
        playerSpawn,
        nodes,
        seed: activeSeed,
        recommended: baseMapDef.recommended || { difficulty: 'normal' }
    };
}

function applyMapToGrid(mapId) {
    const rawDef = (typeof mapId === 'object' && mapId !== null) ? mapId : (MAP_CATALOG[mapId] || MAP_CATALOG.canyon);

    // Если активен размер карты (256, 512, 1024), строим масштабированную версию
    let mapDef = rawDef;
    let sizeConfig = null;
    if (typeof currentMapSize !== 'undefined' && typeof MAP_SIZE_CONFIGS !== 'undefined' && MAP_SIZE_CONFIGS[currentMapSize]) {
        sizeConfig = MAP_SIZE_CONFIGS[currentMapSize];
        GRID_SIZE = sizeConfig.gridSize;
        CELL_SIZE = sizeConfig.cellSize;
        MAP_WORLD_SIZE = sizeConfig.worldSize;
        mapDef = buildScaledMap(rawDef, currentMapSize, currentMapSeed);
    }
    syncSeedUI();

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
            name: (typeof t === 'function' && n.nameKey) ? t(n.nameKey) : (n.name || n.id)
        }));
    }

    // 1.5. Синхронизируем размер массива grid
    if (typeof grid !== 'undefined' && Array.isArray(grid)) {
        grid.length = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            grid.push(new Array(GRID_SIZE).fill(0));
        }
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

    // 2.5. Ресайз SpatialGrid и Flow Fields под новый размер
    if (typeof spatialGrid !== 'undefined' && spatialGrid && typeof spatialGrid.resize === 'function') {
        spatialGrid.resize(MAP_WORLD_SIZE, 4.0);
    }
    if (typeof flowFieldGen !== 'undefined' && flowFieldGen && typeof flowFieldGen.resize === 'function') {
        flowFieldGen.resize(GRID_SIZE, GRID_SIZE, CELL_SIZE);
    }
    if (typeof enemyFlowFieldGen !== 'undefined' && enemyFlowFieldGen && typeof enemyFlowFieldGen.resize === 'function') {
        enemyFlowFieldGen.resize(GRID_SIZE, GRID_SIZE, CELL_SIZE);
    }

    // 3. Синхронизируем Three.js камеру, свет, туман, землю и периметр
    if (typeof updateCameraAndSceneForMapSize === 'function' && sizeConfig) {
        updateCameraAndSceneForMapSize(sizeConfig);
    }
    if (typeof updateTerrainForMapSize === 'function') {
        updateTerrainForMapSize(MAP_WORLD_SIZE, GRID_SIZE, CELL_SIZE);
    }

    // 3.5. Синхронизируем 3D-позиции баз и ресурсов в Three.js сцене
    if (typeof playerHQ !== 'undefined' && playerHQ && playerHQ.mesh && typeof gridToWorld === 'function') {
        const pPos = gridToWorld(HQ_COL, HQ_ROW);
        playerHQ.mesh.position.set(pPos.x, 0, pPos.z);
    }
    if (typeof enemyHQ !== 'undefined' && enemyHQ && enemyHQ.mesh && typeof gridToWorld === 'function') {
        const ePos = gridToWorld(ENEMY_HQ_COL, ENEMY_HQ_ROW);
        enemyHQ.mesh.position.set(ePos.x, 0, ePos.z);
    }
    if (typeof syncResourceNodes === 'function') {
        syncResourceNodes(mapDef.nodes);
    } else if (typeof resourceNodes !== 'undefined' && Array.isArray(resourceNodes) && typeof gridToWorld === 'function') {
        mapDef.nodes.forEach((n, idx) => {
            if (resourceNodes[idx]) {
                const node = resourceNodes[idx];
                node.col = n.col;
                node.row = n.row;
                const wp = gridToWorld(n.col, n.row);
                node.pos.set(wp.x, 0, wp.z);
                node.group.position.set(wp.x, 0, wp.z);
                node.name = (typeof t === 'function' && n.nameKey) ? t(n.nameKey) : (n.name || n.id);
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
