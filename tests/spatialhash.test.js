// =============================================================================
// tests/spatialhash.test.js — Spatial Grid: вставка в ячейки, поиск целей
// с тактическим приоритетом и расталкивание юнитов (spatial / naive)
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import helpers from './helpers/loadGame.js';
const { loadGame } = helpers;

let game;
let grid; // SpatialGrid 44x44, ячейка 4 (11x11 ячеек), как в игре
beforeEach(() => {
    game = loadGame();
    grid = new game.SpatialGrid(game.MAP_WORLD_SIZE, 4.0);
});

function makeUnit(x, z, props = {}) {
    return {
        mesh: { position: new game.THREE.Vector3(x, 0, z) },
        hp: 100,
        maxHp: 100,
        radius: 0.5,
        type: 'standard',
        ...props
    };
}

const origin = (x = 0, z = 0) => new game.THREE.Vector3(x, 0, z);

describe('конструктор', () => {
    it('считает число ячеек с округлением вверх', () => {
        const g = new game.SpatialGrid(10, 4);

        expect(g.cols).toBe(3);
        expect(g.rows).toBe(3);
        expect(g.cells).toHaveLength(9);
        expect(g.halfMap).toBe(5);
    });

    it('глобальный spatialGrid покрывает карту ячейками по 4.0', () => {
        expect(game.spatialGrid.cellSize).toBe(4.0);
        expect(game.spatialGrid.cols).toBe(11);
        expect(game.spatialGrid.rows).toBe(11);
        expect(game.spatialGrid.collisionMode).toBe('spatial');
    });
});

describe('insert / clear', () => {
    it('кладёт юнита в ячейку по координатам мира', () => {
        const u = makeUnit(0.5, 0.5); // центр карты → ячейка (5,5)

        grid.insert(u, false);

        expect(grid.cells[5 * grid.cols + 5].all).toEqual([u]);
    });

    it('разделяет союзников и врагов', () => {
        const ally = makeUnit(0, 0);
        const enemy = makeUnit(0.2, 0.2);

        grid.insert(ally, false);
        grid.insert(enemy, true);

        const cell = grid.cells[5 * grid.cols + 5];
        expect(cell.allies).toEqual([ally]);
        expect(cell.enemies).toEqual([enemy]);
        expect(cell.all).toEqual([ally, enemy]);
    });

    it('левая граница карты входит в ячейку 0, правая и всё за краем — игнорируется', () => {
        const edge = makeUnit(-22, -22);
        const outRight = makeUnit(22, 0);
        const outLeft = makeUnit(-22.01, 0);
        const outDown = makeUnit(0, 22);

        [edge, outRight, outLeft, outDown].forEach(u => grid.insert(u, false));

        expect(grid.cells[0].all).toEqual([edge]);
        const total = grid.cells.reduce((sum, cell) => sum + cell.all.length, 0);
        expect(total).toBe(1);
    });

    it('clear очищает ячейки, не пересоздавая массивы (zero-allocation)', () => {
        const cell = grid.cells[5 * grid.cols + 5];
        const refs = [cell.allies, cell.enemies, cell.all];
        grid.insert(makeUnit(0, 0), false);
        grid.insert(makeUnit(0, 0), true);

        grid.clear();

        expect(cell.all).toHaveLength(0);
        expect(cell.allies).toHaveLength(0);
        expect(cell.enemies).toHaveLength(0);
        expect([cell.allies, cell.enemies, cell.all]).toEqual(refs);
        expect(cell.allies).toBe(refs[0]);
        expect(cell.all).toBe(refs[2]);
    });

    it('clear переносит pairsTested в lastPairsTested и обнуляет счётчик', () => {
        grid.pairsTested = 7;

        grid.clear();

        expect(grid.lastPairsTested).toBe(7);
        expect(grid.pairsTested).toBe(0);
    });
});

describe('findNearest', () => {
    it('без целей возвращает null и maxDist', () => {
        expect(grid.findNearest(origin(), 8, 'enemy')).toEqual({ unit: null, dist: 8 });
        expect(grid.findNearest(origin(), 8, 'enemy', false)).toEqual({ unit: null, dist: 8 });
    });

    it('ищет только среди юнитов запрошенной команды', () => {
        const ally = makeUnit(1, 0);
        const enemy = makeUnit(3, 0);
        grid.insert(ally, false);
        grid.insert(enemy, true);

        expect(grid.findNearest(origin(), 8, 'enemy').unit).toBe(enemy);
        expect(grid.findNearest(origin(), 8, 'ally').unit).toBe(ally);
    });

    it('без приоритета выбирает ближайшую цель и возвращает реальную дистанцию', () => {
        const far = makeUnit(5, 0);
        const near = makeUnit(2, 0);
        grid.insert(far, true);
        grid.insert(near, true);

        const res = grid.findNearest(origin(), 8, 'enemy', false);

        expect(res.unit).toBe(near);
        expect(res.dist).toBeCloseTo(2, 9);
    });

    it('игнорирует мёртвые цели', () => {
        const dead = makeUnit(1, 0, { hp: 0 });
        const alive = makeUnit(5, 0);
        grid.insert(dead, true);
        grid.insert(alive, true);

        expect(grid.findNearest(origin(), 8, 'enemy').unit).toBe(alive);
        expect(grid.findNearest(origin(), 8, 'enemy', false).unit).toBe(alive);
    });

    it('игнорирует цели за пределами maxDist, но включает ровно на границе', () => {
        const edge = makeUnit(5, 0);
        const outside = makeUnit(0, 5.01);
        grid.insert(edge, true);
        grid.insert(outside, true);

        expect(grid.findNearest(origin(), 5, 'enemy').unit).toBe(edge);
        expect(grid.findNearest(origin(0, 20), 5, 'enemy').unit).toBeNull();
        expect(grid.findNearest(origin(0, 0), 4.99, 'enemy').unit).toBeNull();
    });

    it('находит цель в соседней ячейке', () => {
        // Ячейки (5,5) и (6,5) разделены границей x = 2
        const target = makeUnit(2.3, 0);
        grid.insert(target, true);

        const res = grid.findNearest(origin(1.8, 0), 3, 'enemy');

        expect(res.unit).toBe(target);
        expect(res.dist).toBeCloseTo(0.5, 9);
    });

    it('у края карты окно поиска обрезается без ошибок', () => {
        const target = makeUnit(-20, -20);
        grid.insert(target, true);

        expect(grid.findNearest(origin(-21.9, -21.9), 8, 'enemy').unit).toBe(target);
        expect(grid.findNearest(origin(21.9, 21.9), 8, 'enemy').unit).toBeNull();
    });

    it('юнит за пределами карты в сетку не попадает и не находится', () => {
        grid.insert(makeUnit(30, 0), true);

        expect(grid.findNearest(origin(21, 0), 12, 'enemy').unit).toBeNull();
    });

    describe('тактический приоритет', () => {
        it('раненая цель предпочтительнее более близкой здоровой', () => {
            const healthy = makeUnit(3, 0);
            const wounded = makeUnit(4, 0, { hp: 10 });
            grid.insert(healthy, true);
            grid.insert(wounded, true);

            const res = grid.findNearest(origin(), 8, 'enemy');

            expect(res.unit).toBe(wounded);
            expect(res.dist).toBeCloseTo(4, 9);
            expect(grid.findNearest(origin(), 8, 'enemy', false).unit).toBe(healthy);
        });

        it('танк приоритетнее обычного юнита чуть ближе', () => {
            const standard = makeUnit(3, 0);
            const tank = makeUnit(4, 0, { type: 'tank' });
            grid.insert(standard, true);
            grid.insert(tank, true);

            expect(grid.findNearest(origin(), 8, 'enemy').unit).toBe(tank);
        });

        it('босс приоритетнее танка на той же дистанции', () => {
            const tank = makeUnit(4, 0, { type: 'tank' });
            const boss = makeUnit(0, 4, { type: 'boss' });
            grid.insert(tank, true);
            grid.insert(boss, true);

            expect(grid.findNearest(origin(), 8, 'enemy').unit).toBe(boss);
        });

        it('осадный режим даёт самый высокий приоритет (выше танка)', () => {
            const tank = makeUnit(3.8, 0, { type: 'tank' });
            const sieged = makeUnit(0, 4.4, { isSieged: true });
            grid.insert(tank, true);
            grid.insert(sieged, true);

            expect(grid.findNearest(origin(), 8, 'enemy').unit).toBe(sieged);
        });

        it('бонусы ограничены: сильно более далёкую цель они не перевешивают', () => {
            const near = makeUnit(1, 0);
            const farTank = makeUnit(7, 0, { type: 'tank', hp: 1 });
            grid.insert(near, true);
            grid.insert(farTank, true);

            expect(grid.findNearest(origin(), 8, 'enemy').unit).toBe(near);
        });

        it('без maxHp здоровье считается от 100', () => {
            const a = makeUnit(3, 0, { hp: 50, maxHp: undefined });
            const b = makeUnit(2.5, 0, { hp: 100, maxHp: 100 });
            grid.insert(a, true);
            grid.insert(b, true);

            // a: 3 - 0.9 = 2.1; b: 2.5 → побеждает a
            expect(grid.findNearest(origin(), 8, 'enemy').unit).toBe(a);
        });
    });
});

describe('resolveSeparation (spatial)', () => {
    function place(units, isEnemy = false) {
        grid.clear();
        units.forEach((u, i) => grid.insert(u, isEnemy || i % 2 === 1));
    }
    const dist = (a, b) => Math.hypot(
        a.mesh.position.x - b.mesh.position.x,
        a.mesh.position.z - b.mesh.position.z
    );

    it('раздвигает пересекающихся юнитов равной массы поровну до касания', () => {
        const a = makeUnit(0, 0);
        const b = makeUnit(0.5, 0);
        place([a, b]);

        grid.resolveSeparation();

        expect(a.mesh.position.x).toBeCloseTo(-0.25, 9);
        expect(b.mesh.position.x).toBeCloseTo(0.75, 9);
        expect(dist(a, b)).toBeCloseTo(1, 9);
    });

    it('не трогает юнитов, которые не пересекаются (в том числе касающихся)', () => {
        const a = makeUnit(0, 0);
        const b = makeUnit(1, 0); // ровно сумма радиусов
        place([a, b]);

        grid.resolveSeparation();

        expect(a.mesh.position.x).toBe(0);
        expect(b.mesh.position.x).toBe(1);
        expect(grid.pairsTested).toBe(1);
    });

    it('тяжёлый юнит смещается меньше лёгкого (вес — квадрат радиуса)', () => {
        const heavy = makeUnit(0, 0, { radius: 1.0 });
        const light = makeUnit(1, 0, { radius: 0.5 });
        place([heavy, light]);

        grid.resolveSeparation();

        // overlap = 0.5, m1 = 1, m2 = 0.25 → heavy сдвигается на 20%, light — на 80%
        expect(heavy.mesh.position.x).toBeCloseTo(-0.1, 9);
        expect(light.mesh.position.x).toBeCloseTo(1.4, 9);
        expect(dist(heavy, light)).toBeCloseTo(1.5, 9);
    });

    it('осадный юнит неподвижен: весь сдвиг достаётся соседу', () => {
        const sieged = makeUnit(0, 0, { isSieged: true });
        const other = makeUnit(0.5, 0);
        place([sieged, other]);

        grid.resolveSeparation();

        expect(sieged.mesh.position.x).toBe(0);
        expect(other.mesh.position.x).toBeCloseTo(1, 9);
    });

    it('осадный юнит неподвижен и на второй позиции в паре', () => {
        const other = makeUnit(0, 0);
        const sieged = makeUnit(0.5, 0, { isSieged: true });
        place([other, sieged]);

        grid.resolveSeparation();

        expect(sieged.mesh.position.x).toBe(0.5);
        expect(other.mesh.position.x).toBeCloseTo(-0.5, 9);
    });

    it('два осадных юнита расходятся поровну', () => {
        const a = makeUnit(0, 0, { isSieged: true });
        const b = makeUnit(0.5, 0, { isSieged: true });
        place([a, b]);

        grid.resolveSeparation();

        expect(a.mesh.position.x).toBeCloseTo(-0.25, 9);
        expect(b.mesh.position.x).toBeCloseTo(0.75, 9);
    });

    it('мёртвые юниты не участвуют в расталкивании', () => {
        const alive = makeUnit(0, 0);
        const dead = makeUnit(0.2, 0, { hp: 0 });
        place([alive, dead]);

        grid.resolveSeparation();

        expect(alive.mesh.position.x).toBe(0);
        expect(dead.mesh.position.x).toBe(0.2);
        expect(grid.pairsTested).toBe(0);
    });

    it('юниты в одной точке расталкиваются вдоль X без NaN', () => {
        const a = makeUnit(3, 3);
        const b = makeUnit(3, 3);
        place([a, b]);

        grid.resolveSeparation();

        for (const u of [a, b]) {
            expect(Number.isFinite(u.mesh.position.x)).toBe(true);
            expect(Number.isFinite(u.mesh.position.z)).toBe(true);
        }
        expect(a.mesh.position.x).toBeLessThan(b.mesh.position.x);
        expect(a.mesh.position.z).toBe(b.mesh.position.z);
        expect(dist(a, b)).toBeCloseTo(1, 3);
    });

    it('расталкивает вдоль линии центров, а не только по осям', () => {
        const a = makeUnit(0, 0);
        const b = makeUnit(0.3, 0.4); // расстояние 0.5
        place([a, b]);

        grid.resolveSeparation();

        expect(dist(a, b)).toBeCloseTo(1, 9);
        // направление a→b сохранилось (0.6, 0.8)
        const dx = b.mesh.position.x - a.mesh.position.x;
        const dz = b.mesh.position.z - a.mesh.position.z;
        expect(dx / 1).toBeCloseTo(0.6, 9);
        expect(dz / 1).toBeCloseTo(0.8, 9);
    });

    // Пара, лежащая по разные стороны границы ячеек, должна проверяться ровно
    // один раз для каждого из 4 направлений соседства: (1,0), (-1,1), (0,1), (1,1)
    describe.each([
        ['вправо (1,0)',        (x0, z0) => [[x0 + 3.9, z0 + 2], [x0 + 4.1, z0 + 2]]],
        ['вниз-влево (-1,1)',   (x0, z0) => [[x0 + 0.1, z0 + 3.9], [x0 - 0.1, z0 + 4.1]]],
        ['вниз (0,1)',          (x0, z0) => [[x0 + 2, z0 + 3.9], [x0 + 2, z0 + 4.1]]],
        ['вниз-вправо (1,1)',   (x0, z0) => [[x0 + 3.9, z0 + 3.9], [x0 + 4.1, z0 + 4.1]]]
    ])('соседние ячейки: %s', (_name, layout) => {
        // Ячейка (5,5): x ∈ [-2, 2), z ∈ [-2, 2)
        const x0 = -2;
        const z0 = -2;

        it.each([['прямой порядок вставки', false], ['обратный порядок вставки', true]])('%s', (_o, reversed) => {
            const [[ax, az], [bx, bz]] = layout(x0, z0);
            const a = makeUnit(ax, az);
            const b = makeUnit(bx, bz);
            grid.clear();
            const pair = reversed ? [b, a] : [a, b];
            pair.forEach(u => grid.insert(u, false));

            grid.resolveSeparation();

            expect(grid.pairsTested).toBe(1);
            expect(dist(a, b)).toBeCloseTo(1, 9);
        });
    });

    it('юниты на краю карты не вызывают выхода за пределы ячеек', () => {
        const corner = makeUnit(-21.9, -21.9);
        const other = makeUnit(21.9, 21.9);
        place([corner, other]);

        expect(() => grid.resolveSeparation()).not.toThrow();
        expect(grid.pairsTested).toBe(0);
    });

    it('считает только проверенные пары: далёкие ячейки не сравниваются', () => {
        const units = [makeUnit(-20, -20), makeUnit(-10, 0), makeUnit(15, 15), makeUnit(20, -20)];
        place(units);

        grid.resolveSeparation();

        expect(grid.pairsTested).toBe(0);
    });
});

describe('resolveSeparation (naive)', () => {
    beforeEach(() => {
        grid.collisionMode = 'naive';
    });

    it('проверяет все пары живых юнитов: n(n-1)/2', () => {
        const units = [];
        for (let i = 0; i < 6; i++) units.push(makeUnit(-20 + i * 7, i * 3 - 8));
        units.push(makeUnit(0, 0, { hp: 0 })); // мёртвый не считается

        grid.resolveSeparation(units);

        expect(grid.pairsTested).toBe(15);
    });

    it('разводит пересекающихся юнитов так же, как spatial-режим', () => {
        const a = makeUnit(0, 0);
        const b = makeUnit(0.5, 0);

        grid.resolveSeparation([a, b]);

        expect(a.mesh.position.x).toBeCloseTo(-0.25, 9);
        expect(b.mesh.position.x).toBeCloseTo(0.75, 9);
    });

    it('не падает без списка юнитов', () => {
        expect(() => grid.resolveSeparation()).not.toThrow();
        expect(grid.pairsTested).toBe(0);
    });

    it('spatial-режим проверяет не больше пар, чем naive', () => {
        const units = [];
        for (let i = 0; i < 40; i++) {
            units.push(makeUnit(-18 + (i % 8) * 5, -18 + Math.floor(i / 8) * 8));
        }

        grid.collisionMode = 'naive';
        grid.resolveSeparation(units);
        const naivePairs = grid.pairsTested;

        grid.collisionMode = 'spatial';
        grid.clear();
        units.forEach(u => grid.insert(u, false));
        grid.resolveSeparation(units);

        expect(naivePairs).toBe(40 * 39 / 2);
        expect(grid.pairsTested).toBeLessThan(naivePairs);
    });
});
