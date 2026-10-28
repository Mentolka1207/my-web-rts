// =============================================================================
// tests/formations.test.js — Тактические построения: смещения юнитов для
// шеренги, клина и круга, а также переключение построения и подсветка кнопок
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import helpers from './helpers/loadGame.js';
const { loadGame } = helpers;

let game;
beforeEach(() => {
    game = loadGame();
});

const xy = offsets => offsets.map(v => [v.x, v.y]);

function expectOffsets(actual, expected) {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((v, i) => {
        expect(v.x, `offset ${i}.x`).toBeCloseTo(expected[i][0], 9);
        expect(v.y, `offset ${i}.y`).toBeCloseTo(expected[i][1], 9);
    });
}

describe('getFormationOffsets: line', () => {
    it('один юнит стоит в центре', () => {
        expectOffsets(game.getFormationOffsets(1, 'line'), [[0, 0]]);
    });

    it('юниты расходятся в стороны попеременно (центр, лево, право, ...)', () => {
        const S = game.SPACING;

        expectOffsets(game.getFormationOffsets(5, 'line'), [
            [0, 0], [-S, 0], [S, 0], [-2 * S, 0], [2 * S, 0]
        ]);
    });

    it('все смещения лежат на одной линии (y = 0)', () => {
        for (const v of game.getFormationOffsets(9, 'line')) expect(v.y).toBe(0);
    });

    it('при нечётном числе юнитов шеренга симметрична', () => {
        const sum = game.getFormationOffsets(7, 'line').reduce((acc, v) => acc + v.x, 0);

        expect(sum).toBeCloseTo(0, 9);
    });
});

describe('getFormationOffsets: wedge', () => {
    it('вершина клина в начале координат, остальные уходят назад по диагоналям', () => {
        const S = game.SPACING;

        expectOffsets(game.getFormationOffsets(5, 'wedge'), [
            [0, 0], [-S, -S], [S, -S], [-2 * S, -2 * S], [2 * S, -2 * S]
        ]);
    });

    it('ни один юнит не стоит впереди вершины', () => {
        for (const v of game.getFormationOffsets(12, 'wedge')) expect(v.y).toBeLessThanOrEqual(0);
    });
});

describe('getFormationOffsets: circle', () => {
    it('все юниты лежат на окружности одного радиуса, первый — на оси X', () => {
        const offsets = game.getFormationOffsets(8, 'circle');
        const radius = Math.hypot(offsets[0].x, offsets[0].y);

        expect(offsets[0].x).toBeCloseTo(radius, 9);
        expect(offsets[0].y).toBeCloseTo(0, 9);
        for (const v of offsets) expect(Math.hypot(v.x, v.y)).toBeCloseTo(radius, 9);
    });

    it('минимальный радиус 1.8 для малых отрядов', () => {
        const offsets = game.getFormationOffsets(3, 'circle');

        expect(Math.hypot(offsets[0].x, offsets[0].y)).toBeCloseTo(1.8, 9);
    });

    it('радиус растёт вместе с числом юнитов', () => {
        const n = 40;
        const offsets = game.getFormationOffsets(n, 'circle');

        expect(Math.hypot(offsets[0].x, offsets[0].y)).toBeCloseTo((n * game.SPACING) / (2 * Math.PI), 9);
    });

    it('юниты равномерно распределены по углу', () => {
        const n = 6;
        const offsets = game.getFormationOffsets(n, 'circle');

        offsets.forEach((v, i) => {
            const expected = (i / n) * Math.PI * 2;
            expect(Math.cos(Math.atan2(v.y, v.x))).toBeCloseTo(Math.cos(expected), 9);
            expect(Math.sin(Math.atan2(v.y, v.x))).toBeCloseTo(Math.sin(expected), 9);
        });
    });
});

describe('getFormationOffsets: общие свойства', () => {
    it('нулевое число юнитов в шеренге и круге и неизвестный тип дают пустой массив', () => {
        expect(game.getFormationOffsets(0, 'line')).toEqual([]);
        expect(game.getFormationOffsets(0, 'circle')).toEqual([]);
        expect(game.getFormationOffsets(5, 'unknown')).toEqual([]);
        expect(game.getFormationOffsets(5, undefined)).toEqual([]);
    });

    it('возвращает ровно numUnits смещений типа THREE.Vector2', () => {
        for (const type of ['line', 'wedge', 'circle']) {
            for (const n of [1, 2, 7, 30]) {
                const offsets = game.getFormationOffsets(n, type);
                expect(offsets).toHaveLength(n);
                for (const v of offsets) expect(v).toBeInstanceOf(game.THREE.Vector2);
            }
        }
    });

    it('позиции в строю не сливаются (минимум 1 ед. между любыми двумя юнитами)', () => {
        for (const type of ['line', 'wedge', 'circle']) {
            for (let n = 2; n <= 30; n++) {
                const o = game.getFormationOffsets(n, type);
                for (let i = 0; i < n; i++) {
                    for (let j = i + 1; j < n; j++) {
                        expect(Math.hypot(o[i].x - o[j].x, o[i].y - o[j].y), `${type} n=${n} ${i}-${j}`)
                            .toBeGreaterThan(1.0);
                    }
                }
            }
        }
    });

    it('каждый вызов возвращает новые независимые объекты', () => {
        const a = game.getFormationOffsets(3, 'line');
        const b = game.getFormationOffsets(3, 'line');
        a[1].x = 999;

        expect(xy(b)[1][0]).toBeCloseTo(-game.SPACING, 9);
    });
});

describe('setFormation / updateFormationUI', () => {
    const makeButtons = () => ({
        'formation-line-btn': { style: {} },
        'formation-wedge-btn': { style: {} },
        'formation-circle-btn': { style: {} }
    });

    it('по умолчанию выбрана шеренга', () => {
        expect(game.getCurrentFormation()).toBe('line');
    });

    it('setFormation меняет текущее построение', () => {
        game.setFormation('wedge');
        expect(game.getCurrentFormation()).toBe('wedge');

        game.setFormation('circle');
        expect(game.getCurrentFormation()).toBe('circle');
    });

    it('подсвечивает только кнопку активного построения', () => {
        const buttons = makeButtons();
        game.context.document.getElementById = id => buttons[id] || null;

        game.setFormation('wedge');

        expect(buttons['formation-wedge-btn'].style.background).toBe('#00ffcc');
        expect(buttons['formation-wedge-btn'].style.color).toBe('#000000');
        expect(buttons['formation-line-btn'].style.background).toBe('#0077ff');
        expect(buttons['formation-line-btn'].style.boxShadow).toBe('none');
        expect(buttons['formation-circle-btn'].style.background).toBe('#0077ff');
    });

    it('не падает, если кнопок нет в разметке', () => {
        game.context.document.getElementById = () => null;

        expect(() => game.setFormation('circle')).not.toThrow();
        expect(() => game.updateFormationUI()).not.toThrow();
    });

    it('проигрывает звук выбора, если аудио-модуль загружен', () => {
        const sound = vi.fn();
        game.context.playSelectSound = sound;

        game.setFormation('wedge');

        expect(sound).toHaveBeenCalledTimes(1);
    });

    it('работает без аудио-модуля (playSelectSound не определён)', () => {
        expect(() => game.setFormation('wedge')).not.toThrow();
    });
});
