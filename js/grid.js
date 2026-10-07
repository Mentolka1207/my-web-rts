// =============================================================================
// js/grid.js — Логика сетки карты, препятствий и преобразования координат
// =============================================================================

const grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));

// Внешние стены
for (let i = 0; i < GRID_SIZE; i++) {
    grid[0][i] = 1; 
    grid[GRID_SIZE - 1][i] = 1;
    grid[i][0] = 1; 
    grid[i][GRID_SIZE - 1] = 1;
}

// Случайные внутренние препятствия
for (let i = 0; i < 25; i++) {
    const rx = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
    const rz = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
    if ((rx > 4 || rz > 4) && (rx < GRID_SIZE - 5 || rz < GRID_SIZE - 5) && grid[rz][rx] === 0) {
        grid[rz][rx] = 1;
    }
}

// Очистка клеток вокруг стратегических точек сбора ресурсов
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

// Клетки штабов непроходимы для поиска пути
grid[HQ_ROW][HQ_COL] = 1;
grid[ENEMY_HQ_ROW][ENEMY_HQ_COL] = 1;

// Преобразование координат: Мир -> Сетка
function worldToGrid(x, z) {
    const halfMap = MAP_WORLD_SIZE * 0.5;
    return {
        col: Math.floor((x + halfMap) / CELL_SIZE),
        row: Math.floor((z + halfMap) / CELL_SIZE)
    };
}

// Преобразование координат: Сетка -> Мир (центр клетки)
function gridToWorld(col, row) {
    const halfMap = MAP_WORLD_SIZE * 0.5;
    const halfCell = CELL_SIZE * 0.5;
    return {
        x: col * CELL_SIZE - halfMap + halfCell,
        z: row * CELL_SIZE - halfMap + halfCell
    };
}

// Проверка прямой видимости между двумя точками мира (Bresenham raycast по сетке)
function hasLineOfSight(x0, z0, x1, z1) {
    const start = worldToGrid(x0, z0);
    const end = worldToGrid(x1, z1);
    let c0 = start.col, r0 = start.row;
    const c1 = end.col, r1 = end.row;

    const dc = Math.abs(c1 - c0);
    const dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc - dr;

    while (true) {
        if (c0 >= 0 && c0 < GRID_SIZE && r0 >= 0 && r0 < GRID_SIZE) {
            // Промежуточные препятствия блокируют луч (стартовая и конечная точки не считаются блокировкой)
            if ((c0 !== start.col || r0 !== start.row) && (c0 !== c1 || r0 !== r1)) {
                if (grid[r0][c0] === 1) return false;
            }
        }
        if (c0 === c1 && r0 === r1) break;
        const e2 = 2 * err;
        if (e2 > -dr) {
            err -= dr;
            c0 += sc;
        }
        if (e2 < dc) {
            err += dc;
            r0 += sr;
        }
    }
    return true;
}

// Поиск направления обхода стены к цели (выбирается ближайшая проходимая соседняя ячейка)
function findBypassDirection(fromX, fromZ, targetX, targetZ, outVec) {
    const g = worldToGrid(fromX, fromZ);
    let bestDistSq = Infinity;
    let bestX = targetX;
    let bestZ = targetZ;
    let found = false;

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dc === 0 && dr === 0) continue;
            const nr = g.row + dr;
            const nc = g.col + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc] === 0) {
                const w = gridToWorld(nc, nr);
                const dSq = (w.x - targetX) * (w.x - targetX) + (w.z - targetZ) * (w.z - targetZ);
                if (dSq < bestDistSq) {
                    bestDistSq = dSq;
                    bestX = w.x;
                    bestZ = w.z;
                    found = true;
                }
            }
        }
    }

    if (found) {
        outVec.set(bestX - fromX, 0, bestZ - fromZ).normalize();
    } else {
        outVec.set(targetX - fromX, 0, targetZ - fromZ).normalize();
    }
}

