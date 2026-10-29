// =============================================================================
// tests/flowfield.test.js — Flow Field: integration (BFS), векторы потока,
// обработка соседей на краях карты, недостижимые клетки и LRU-кэш
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import helpers from './helpers/loadGame.js';
const { loadGame, buildField, integrationRows } = helpers;

const UNREACHABLE = 65535;

let game;
beforeEach(() => {
    game = loadGame();
});

// Шаг по полю: знак компонент вектора потока (диагональ даёт ±1/±1)
function followFlow(gen, col, row) {
    const path = [{ col, row }];
    for (let i = 0; i < gen.totalCells; i++) {
        const idx = row * gen.width + col;
        const vx = gen.flowVectorsX[idx];
        const vy = gen.flowVectorsY[idx];
        if (vx === 0 && vy === 0) break;
        col += Math.sign(vx);
        row += Math.sign(vy);
        path.push({ col, row });
    }
    return path;
}

// Эталонный BFS по 4-связной сетке (независимая реализация для сверки)
function referenceDistances(rows, target) {
    const h = rows.length;
    const w = rows[0].length;
    const dist = rows.map(line => Array(line.length).fill(UNREACHABLE));
    dist[target.row][target.col] = 0;
    const queue = [[target.col, target.row]];
    for (let head = 0; head < queue.length; head++) {
        const [c, r] = queue[head];
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc < 0 || nc >= w || nr < 0 || nr >= h) continue;
            if (rows[nr][nc] === '#') continue;
            if (dist[nr][nc] !== UNREACHABLE) continue;
            dist[nr][nc] = dist[r][c] + 1;
            queue.push([nc, nr]);
        }
    }
    return dist;
}

// Детерминированный Mulberry32 для случайных раскладок в тестах
function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        let t = (s += 0x6D2B79F5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('generateIntegrationField', () => {
    it('на открытой сетке даёт манхэттенское расстояние до цели', () => {
        const gen = buildField(game, [
            '.....',
            '.....',
            '.....',
            '.....',
            '.....'
        ], { col: 2, row: 2 });

        expect(integrationRows(gen)).toEqual([
            [4, 3, 2, 3, 4],
            [3, 2, 1, 2, 3],
            [2, 1, 0, 1, 2],
            [3, 2, 1, 2, 3],
            [4, 3, 2, 3, 4]
        ]);
    });

    it('огибает стены: расстояние считается по обходному пути', () => {
        const gen = buildField(game, [
            '..#..',
            '..#..',
            '..#..',
            '.....'
        ], { col: 0, row: 0 });

        // (4,0) достижима только через нижний проход: 0,0 -> 0,3 -> 4,3 -> 4,0
        expect(gen.integrationField[0][4]).toBe(3 + 4 + 3);
    });

    it('стены остаются со значением UNREACHABLE', () => {
        const gen = buildField(game, [
            '...',
            '.#.',
            '...'
        ], { col: 0, row: 0 });

        expect(gen.integrationField[1][1]).toBe(UNREACHABLE);
    });

    it('совпадает с эталонным BFS на случайных раскладках', () => {
        for (let seed = 1; seed <= 12; seed++) {
            const rnd = makeRng(seed);
            const rows = [];
            for (let r = 0; r < 12; r++) {
                let line = '';
                for (let c = 0; c < 12; c++) line += rnd() < 0.3 ? '#' : '.';
                rows.push(line);
            }
            // Цель — первая свободная клетка
            let target = null;
            for (let r = 0; r < rows.length && !target; r++) {
                const c = rows[r].indexOf('.');
                if (c >= 0) target = { col: c, row: r };
            }

            const gen = buildField(game, rows, target);
            expect(integrationRows(gen), `seed ${seed}`).toEqual(referenceDistances(rows, target));
        }
    });

    it('1x1 сетка: цель — единственная клетка с нулевым вектором', () => {
        const gen = buildField(game, ['.'], { col: 0, row: 0 });

        expect(integrationRows(gen)).toEqual([[0]]);
        expect(gen.flowVectorsX[0]).toBe(0);
        expect(gen.flowVectorsY[0]).toBe(0);
    });
});

describe('недостижимые и заблокированные клетки', () => {
    it('замкнутый карман без цели внутри остаётся UNREACHABLE с нулевым потоком', () => {
        const gen = buildField(game, [
            '.....',
            '.###.',
            '.#.#.',
            '.###.',
            '.....'
        ], { col: 0, row: 0 });

        expect(gen.integrationField[2][2]).toBe(UNREACHABLE);
        expect(gen.flowField[2][2].x).toBe(0);
        expect(gen.flowField[2][2].y).toBe(0);
        // Внешнее кольцо при этом достижимо
        expect(gen.integrationField[4][4]).toBe(8);
    });

    it('цель внутри кармана: наружу волна не выходит', () => {
        const gen = buildField(game, [
            '.....',
            '.###.',
            '.#.#.',
            '.###.',
            '.....'
        ], { col: 2, row: 2 });

        expect(gen.integrationField[2][2]).toBe(0);
        for (const [c, r] of [[0, 0], [4, 4], [0, 4], [4, 0], [2, 0]]) {
            expect(gen.integrationField[r][c]).toBe(UNREACHABLE);
            expect(gen.flowVectorsX[r * gen.width + c]).toBe(0);
            expect(gen.flowVectorsY[r * gen.width + c]).toBe(0);
        }
    });

    it('полностью изолированная свободная клетка не получает потока', () => {
        const gen = buildField(game, [
            '.#.',
            '#..',
            '...'
        ], { col: 1, row: 1 });

        // (0,0) окружена стенами с двух сторон; диагональ на (1,1) режется правилом углов
        expect(gen.integrationField[0][0]).toBe(UNREACHABLE);
        expect(gen.flowField[0][0].x).toBe(0);
        expect(gen.flowField[0][0].y).toBe(0);
    });

    it('стены всегда имеют нулевой вектор потока', () => {
        const gen = buildField(game, [
            '...',
            '.#.',
            '...'
        ], { col: 0, row: 0 });

        expect(gen.flowField[1][1].x).toBe(0);
        expect(gen.flowField[1][1].y).toBe(0);
        expect(gen.flowVectorsX[4]).toBe(0);
        expect(gen.flowVectorsY[4]).toBe(0);
    });

    it('сетка, где вся карта кроме цели — стены: все прочие клетки недостижимы', () => {
        const gen = buildField(game, [
            '###',
            '#.#',
            '###'
        ], { col: 1, row: 1 });

        expect(integrationRows(gen)).toEqual([
            [UNREACHABLE, UNREACHABLE, UNREACHABLE],
            [UNREACHABLE, 0, UNREACHABLE],
            [UNREACHABLE, UNREACHABLE, UNREACHABLE]
        ]);
    });

    it('цель на заблокированной клетке (как штаб) засевает волну, но сама не движется', () => {
        const gen = buildField(game, [
            '...',
            '.#.',
            '...'
        ], { col: 1, row: 1 });

        expect(gen.integrationField[1][1]).toBe(0);
        expect(gen.integrationField[0][1]).toBe(1);
        expect(gen.integrationField[2][1]).toBe(1);
        expect(gen.integrationField[1][0]).toBe(1);
        expect(gen.integrationField[1][2]).toBe(1);
        // Соседи указывают на цель, сама цель — стоит
        expect(gen.flowField[0][1].x).toBe(0);
        expect(gen.flowField[0][1].y).toBe(1);
        expect(gen.flowField[1][1].x).toBe(0);
        expect(gen.flowField[1][1].y).toBe(0);
    });
});

describe('соседи на краях сетки', () => {
    it('нет горизонтального «заворачивания» индекса через край строки', () => {
        // Колонка стен делит поле: левая часть достижима только если c-1 у левого края
        // «перепрыгивает» на последнюю колонку предыдущей строки
        const gen = buildField(game, [
            '.#.',
            '.#.',
            '.#.'
        ], { col: 2, row: 0 });

        expect(integrationRows(gen)).toEqual([
            [UNREACHABLE, UNREACHABLE, 0],
            [UNREACHABLE, UNREACHABLE, 1],
            [UNREACHABLE, UNREACHABLE, 2]
        ]);
    });

    it('цель в углу: расчёт не падает и покрывает всю сетку', () => {
        const rows = ['....', '....', '....'];
        for (const target of [
            { col: 0, row: 0 }, { col: 3, row: 0 }, { col: 0, row: 2 }, { col: 3, row: 2 }
        ]) {
            const gen = buildField(game, rows, target);
            expect(integrationRows(gen)).toEqual(referenceDistances(rows, target));
        }
    });

    it('одномерные сетки (1 строка и 1 столбец) считаются корректно', () => {
        const row = buildField(game, ['.....'], { col: 4, row: 0 });
        expect(integrationRows(row)).toEqual([[4, 3, 2, 1, 0]]);

        const column = buildField(game, ['.', '.', '.'], { col: 0, row: 0 });
        expect(integrationRows(column)).toEqual([[0], [1], [2]]);
    });
});

describe('generateFlowField', () => {
    it('в открытом поле диагональный вектор нормализован', () => {
        const gen = buildField(game, [
            '.....',
            '.....',
            '.....',
            '.....',
            '.....'
        ], { col: 2, row: 2 });

        const f = gen.flowField[0][0];
        expect(f.x).toBeCloseTo(Math.SQRT1_2, 6);
        expect(f.y).toBeCloseTo(Math.SQRT1_2, 6);
        expect(gen.flowVectorsX[0]).toBeCloseTo(Math.SQRT1_2, 6);
        expect(gen.flowVectorsY[0]).toBeCloseTo(Math.SQRT1_2, 6);
    });

    it('у цели вектор нулевой, на оси — единичный', () => {
        const gen = buildField(game, [
            '.....',
            '.....',
            '.....'
        ], { col: 2, row: 1 });

        expect(gen.flowField[1][2].x).toBe(0);
        expect(gen.flowField[1][2].y).toBe(0);
        expect(gen.flowField[1][0].x).toBe(1);
        expect(gen.flowField[1][0].y).toBe(0);
        expect(gen.flowField[1][4].x).toBe(-1);
        expect(gen.flowField[1][4].y).toBe(0);
    });

    it('не режет угол стены по диагонали', () => {
        const gen = buildField(game, [
            '.#.',
            '...',
            '...'
        ], { col: 1, row: 1 });

        // (0,0): диагональ на цель проходит мимо угла стены (1,0) — запрещена,
        // поэтому юнит идёт вниз, а не по диагонали
        expect(gen.integrationField[0][0]).toBe(2);
        expect(gen.flowField[0][0].x).toBe(0);
        expect(gen.flowField[0][0].y).toBe(1);
        // Зеркальный случай справа
        expect(gen.flowField[0][2].x).toBe(0);
        expect(gen.flowField[0][2].y).toBe(1);
        // А нижний угол без препятствий — по диагонали
        expect(gen.flowField[2][0].x).toBeCloseTo(Math.SQRT1_2, 6);
        expect(gen.flowField[2][0].y).toBeCloseTo(-Math.SQRT1_2, 6);
    });

    it('2D-поля синхронизированы с плоскими типизированными буферами', () => {
        const gen = buildField(game, [
            '..#..',
            '.....',
            '.#...',
            '.....'
        ], { col: 4, row: 3 });

        for (let r = 0; r < gen.height; r++) {
            for (let c = 0; c < gen.width; c++) {
                const idx = r * gen.width + c;
                expect(gen.integrationField[r][c]).toBe(gen.integrationFlat[idx]);
                expect(gen.flowField[r][c].x).toBeCloseTo(gen.flowVectorsX[idx], 6);
                expect(gen.flowField[r][c].y).toBeCloseTo(gen.flowVectorsY[idx], 6);
            }
        }
    });

    it('следование за потоком из любой достижимой клетки приводит к цели', () => {
        const rows = [
            '....#....',
            '.##.#.##.',
            '.#..#..#.',
            '.#.###.#.',
            '.#.....#.',
            '.#######.',
            '.........'
        ];
        const target = { col: 8, row: 0 };
        const gen = buildField(game, rows, target);
        const dist = referenceDistances(rows, target);

        for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows[r].length; c++) {
                if (rows[r][c] === '#' || dist[r][c] === UNREACHABLE) continue;
                const path = followFlow(gen, c, r);
                const end = path[path.length - 1];
                expect({ col: end.col, row: end.row }, `from ${c},${r}`).toEqual(target);
                for (const p of path) expect(rows[p.row][p.col]).not.toBe('#');
            }
        }
    });

    it('на случайных раскладках шаг по потоку всегда уменьшает расстояние и не заходит в стены', () => {
        for (let seed = 100; seed < 110; seed++) {
            const rnd = makeRng(seed);
            const rows = [];
            for (let r = 0; r < 14; r++) {
                let line = '';
                for (let c = 0; c < 14; c++) line += rnd() < 0.25 ? '#' : '.';
                rows.push(line);
            }
            const target = { col: 7, row: 7 };
            rows[7] = rows[7].slice(0, 7) + '.' + rows[7].slice(8);

            const gen = buildField(game, rows, target);
            const dist = referenceDistances(rows, target);

            for (let r = 0; r < rows.length; r++) {
                for (let c = 0; c < rows[r].length; c++) {
                    const idx = r * gen.width + c;
                    const vx = gen.flowVectorsX[idx];
                    const vy = gen.flowVectorsY[idx];
                    const tag = `seed ${seed} cell ${c},${r}`;

                    if (rows[r][c] === '#' || dist[r][c] === UNREACHABLE || dist[r][c] === 0) {
                        expect(vx, tag).toBe(0);
                        expect(vy, tag).toBe(0);
                        continue;
                    }
                    expect(Math.hypot(vx, vy), tag).toBeCloseTo(1, 5);
                    const nc = c + Math.sign(vx);
                    const nr = r + Math.sign(vy);
                    expect(rows[nr][nc], tag).not.toBe('#');
                    expect(dist[nr][nc], tag).toBeLessThan(dist[r][c]);
                    if (vx !== 0 && vy !== 0) {
                        // диагональ не режет углы стен
                        expect(rows[r][c + Math.sign(vx)], tag).not.toBe('#');
                        expect(rows[r + Math.sign(vy)][c], tag).not.toBe('#');
                    }
                }
            }
        }
    });
});

describe('кэш и очередь целей', () => {
    const rows = [
        '.....',
        '.....',
        '.....',
        '.....',
        '.....'
    ];
    let gen;
    beforeEach(() => {
        gen = buildField(game, rows);
    });

    it('повторный запрос той же цели ничего не пересчитывает', () => {
        gen.updateTarget(2, 2);
        const spy = vi.spyOn(gen, 'generateIntegrationField');

        gen.updateTarget(2, 2);

        expect(spy).not.toHaveBeenCalled();
        expect(gen.lastComputeTime).toBe(0);
    });

    it('возврат к ранее посчитанной цели берётся из кэша и восстанавливает все поля', () => {
        gen.updateTarget(0, 0);
        const integrationA = integrationRows(gen);
        const flowA = gen.flowField.flat().map(v => [v.x, v.y]);
        gen.updateTarget(4, 4);
        const spy = vi.spyOn(gen, 'generateIntegrationField');

        gen.updateTarget(0, 0);

        expect(spy).not.toHaveBeenCalled();
        expect(gen.currentTargetCol).toBe(0);
        expect(gen.currentTargetRow).toBe(0);
        expect(integrationRows(gen)).toEqual(integrationA);
        // Кэш хранит векторы в Float32Array, поэтому сравниваем с допуском
        gen.flowField.flat().forEach((v, i) => {
            expect(v.x).toBeCloseTo(flowA[i][0], 5);
            expect(v.y).toBeCloseTo(flowA[i][1], 5);
        });
    });

    it('force пересчитывает поле даже при попадании в кэш', () => {
        gen.updateTarget(2, 2);
        const spy = vi.spyOn(gen, 'generateIntegrationField');

        gen.updateTarget(2, 2, true);

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('invalidateFlowFieldCache делает кэшированные поля устаревшими', () => {
        gen.updateTarget(1, 1);
        gen.updateTarget(3, 3);
        const spy = vi.spyOn(gen, 'generateIntegrationField');

        game.invalidateFlowFieldCache();
        gen.updateTarget(3, 3);
        gen.updateTarget(1, 1);

        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('вытесняет самую старую запись при превышении maxCacheSize', () => {
        gen.maxCacheSize = 2;
        gen.updateTarget(0, 0);
        gen.updateTarget(1, 1);
        gen.updateTarget(2, 2);

        expect(gen.cache.size).toBe(2);
        expect(gen.cache.has('0_0')).toBe(false);
        expect(gen.cache.has('1_1')).toBe(true);
        expect(gen.cache.has('2_2')).toBe(true);

        const spy = vi.spyOn(gen, 'generateIntegrationField');
        gen.updateTarget(0, 0);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('queueTarget: из нескольких запросов за тик выполняется только последний', () => {
        const spy = vi.spyOn(gen, 'generateIntegrationField');

        gen.queueTarget(1, 1);
        gen.queueTarget(3, 3);
        gen.processPendingTarget();

        expect(spy).toHaveBeenCalledTimes(1);
        expect(gen.currentTargetCol).toBe(3);
        expect(gen.currentTargetRow).toBe(3);
        expect(gen.pendingTarget).toBeNull();

        gen.processPendingTarget();
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('глобальные поля реальной карты', () => {
    it('вражеское поле сразу нацелено на штаб игрока', () => {
        const { enemyFlowFieldGen, HQ_COL, HQ_ROW } = game;

        expect(enemyFlowFieldGen.currentTargetCol).toBe(HQ_COL);
        expect(enemyFlowFieldGen.currentTargetRow).toBe(HQ_ROW);
        expect(enemyFlowFieldGen.integrationField[HQ_ROW][HQ_COL]).toBe(0);
    });

    it('внешние стены карты не проходимы для потока', () => {
        const { enemyFlowFieldGen, GRID_SIZE } = game;

        for (let i = 0; i < GRID_SIZE; i++) {
            expect(enemyFlowFieldGen.integrationField[0][i]).toBe(UNREACHABLE);
            expect(enemyFlowFieldGen.integrationField[GRID_SIZE - 1][i]).toBe(UNREACHABLE);
            expect(enemyFlowFieldGen.integrationField[i][0]).toBe(UNREACHABLE);
            expect(enemyFlowFieldGen.integrationField[i][GRID_SIZE - 1]).toBe(UNREACHABLE);
        }
    });
});
