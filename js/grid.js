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
