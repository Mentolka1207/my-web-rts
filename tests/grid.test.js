// =============================================================================
// tests/grid.test.js — Сетка: конвертация координат, начальная карта,
// проверка видимости (Bresenham) и поиск направления обхода стен
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import helpers from './helpers/loadGame.js';
const { loadGame, setGrid } = helpers;

let game;
beforeEach(() => {
    game = loadGame();
});

describe('worldToGrid / gridToWorld', () => {
    it('центр клетки переводится в мировые координаты и обратно', () => {
        const { GRID_SIZE, worldToGrid, gridToWorld } = game;

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const w = gridToWorld(c, r);
                expect(worldToGrid(w.x, w.z)).toEqual({ col: c, row: r });
            }
        }
    });

    it('клетка (0,0) центрирована в углу карты', () => {
        const { gridToWorld, MAP_WORLD_SIZE, CELL_SIZE } = game;

        const w = gridToWorld(0, 0);
        expect(w.x).toBe(-MAP_WORLD_SIZE / 2 + CELL_SIZE / 2);
        expect(w.z).toBe(-MAP_WORLD_SIZE / 2 + CELL_SIZE / 2);
    });

    it('границы клеток: левый край включается, правый — нет', () => {
        const { worldToGrid, MAP_WORLD_SIZE, CELL_SIZE } = game;
        const half = MAP_WORLD_SIZE / 2;

        expect(worldToGrid(-half, -half)).toEqual({ col: 0, row: 0 });
        expect(worldToGrid(-half + CELL_SIZE, 0).col).toBe(1);
        expect(worldToGrid(-half + CELL_SIZE - 1e-6, 0).col).toBe(0);
    });

    it('точки за пределами карты не обрезаются, а дают индексы вне сетки', () => {
        const { worldToGrid, GRID_SIZE, MAP_WORLD_SIZE } = game;
        const half = MAP_WORLD_SIZE / 2;

        expect(worldToGrid(half, half)).toEqual({ col: GRID_SIZE, row: GRID_SIZE });
        expect(worldToGrid(-half - 0.001, -half - 0.001)).toEqual({ col: -1, row: -1 });
    });
});

describe('начальная карта', () => {
    it('по периметру стены', () => {
        const { grid, GRID_SIZE } = game;

        for (let i = 0; i < GRID_SIZE; i++) {
            expect(grid[0][i]).toBe(1);
            expect(grid[GRID_SIZE - 1][i]).toBe(1);
            expect(grid[i][0]).toBe(1);
            expect(grid[i][GRID_SIZE - 1]).toBe(1);
        }
    });

    it('клетки штабов непроходимы', () => {
        const { grid, HQ_COL, HQ_ROW, ENEMY_HQ_COL, ENEMY_HQ_ROW } = game;

        expect(grid[HQ_ROW][HQ_COL]).toBe(1);
        expect(grid[ENEMY_HQ_ROW][ENEMY_HQ_COL]).toBe(1);
    });

    it('вокруг ресурсных точек расчищено 3x3', () => {
        const { grid, RESOURCE_NODE_COORDS } = game;

        for (const pt of RESOURCE_NODE_COORDS) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    expect(grid[pt.row + dr][pt.col + dc]).toBe(0);
                }
            }
        }
    });

    it('генерация препятствий детерминирована (одинаковый сид — одинаковая карта)', () => {
        const other = loadGame();

        expect(other.grid).toEqual(game.grid);
    });
});

describe('hasLineOfSight', () => {
    const cell = (c, r) => game.gridToWorld(c, r);
    const los = (a, b) => {
        const p = cell(a[0], a[1]);
        const q = cell(b[0], b[1]);
        return game.hasLineOfSight(p.x, p.z, q.x, q.z);
    };

    it('на свободном поле видимость есть во всех направлениях', () => {
        setGrid(game, []);

        expect(los([2, 2], [10, 2])).toBe(true);
        expect(los([2, 2], [2, 10])).toBe(true);
        expect(los([2, 2], [10, 10])).toBe(true);
        expect(los([10, 10], [2, 2])).toBe(true);
    });

    it('стена между точками блокирует луч в обе стороны', () => {
        setGrid(game, []);
        game.grid[5][6] = 1;

        expect(los([3, 5], [9, 5])).toBe(false);
        expect(los([9, 5], [3, 5])).toBe(false);
    });

    it('стена в стороне от луча не мешает', () => {
        setGrid(game, []);
        game.grid[7][6] = 1;

        expect(los([3, 5], [9, 5])).toBe(true);
    });

    it('стены в стартовой и конечной клетках не считаются блокировкой', () => {
        setGrid(game, []);
        game.grid[5][3] = 1;
        game.grid[5][9] = 1;

        expect(los([3, 5], [9, 5])).toBe(true);
    });

    it('диагональный луч блокируется стеной на диагонали', () => {
        setGrid(game, []);
        game.grid[6][6] = 1;

        expect(los([4, 4], [8, 8])).toBe(false);
    });

    it('одна и та же клетка видит сама себя', () => {
        setGrid(game, []);

        expect(los([4, 4], [4, 4])).toBe(true);
    });

    it('соседние клетки всегда видят друг друга', () => {
        setGrid(game, []);
        game.grid[4][5] = 1;

        expect(los([4, 4], [5, 4])).toBe(true);
    });
});

describe('findBypassDirection', () => {
    let out;
    beforeEach(() => {
        out = new game.THREE.Vector3();
    });

    it('выбирает свободного соседа, ближайшего к цели, и не идёт в стену', () => {
        setGrid(game, []);
        game.grid[5][6] = 1; // стена прямо между юнитом (5,5) и целью справа
        const from = game.gridToWorld(5, 5);
        const to = game.gridToWorld(12, 7);

        game.findBypassDirection(from.x, from.z, to.x, to.z, out);

        // Ближайшая свободная клетка к цели — (6,6): вправо и вниз
        const expected = game.gridToWorld(6, 6);
        const len = Math.hypot(expected.x - from.x, expected.z - from.z);
        expect(out.x).toBeCloseTo((expected.x - from.x) / len, 6);
        expect(out.y).toBe(0);
        expect(out.z).toBeCloseTo((expected.z - from.z) / len, 6);
    });

    it('результат — единичный вектор', () => {
        setGrid(game, []);
        game.grid[5][6] = 1;
        const from = game.gridToWorld(5, 5);
        const to = game.gridToWorld(15, 5.4);

        game.findBypassDirection(from.x, from.z, to.x, to.z, out);

        expect(out.length()).toBeCloseTo(1, 6);
    });

    it('если все соседи — стены, идёт напрямую к цели', () => {
        setGrid(game, []);
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr || dc) game.grid[5 + dr][5 + dc] = 1;
            }
        }
        const from = game.gridToWorld(5, 5);
        const to = game.gridToWorld(15, 5);

        game.findBypassDirection(from.x, from.z, to.x, to.z, out);

        expect(out.x).toBeCloseTo(1, 6);
        expect(out.z).toBeCloseTo(0, 6);
    });

    it('в углу карты соседи за краем сетки пропускаются без ошибок', () => {
        setGrid(game, []);
        const from = game.gridToWorld(0, 0);
        const to = game.gridToWorld(10, 10);

        expect(() => game.findBypassDirection(from.x, from.z, to.x, to.z, out)).not.toThrow();
        expect(out.x).toBeGreaterThan(0);
        expect(out.z).toBeGreaterThan(0);
        expect(out.length()).toBeCloseTo(1, 6);
    });

    it('у края карты не выбирает клетку за пределами сетки', () => {
        setGrid(game, []);
        const last = game.GRID_SIZE - 1;
        const from = game.gridToWorld(last, 10);
        // Цель за правым краем: ближайший сосед по прямой лежит вне сетки
        const to = { x: from.x + 20, z: from.z };

        game.findBypassDirection(from.x, from.z, to.x, to.z, out);

        // Допустимые соседи — только слева (dx <= 0 по колонке)
        expect(out.x).toBeLessThanOrEqual(1e-9);
        expect(out.length()).toBeCloseTo(1, 6);
    });
});
