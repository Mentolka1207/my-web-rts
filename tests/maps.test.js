import { describe, it, expect, beforeEach } from 'vitest';
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadMapsContext() {
    const ctx = vm.createContext({
        console,
        GRID_SIZE: 22,
        CELL_SIZE: 2,
        MAP_WORLD_SIZE: 44,
        grid: Array.from({ length: 22 }, () => Array(22).fill(0)),
        HQ_COL: 1,
        HQ_ROW: 1,
        ENEMY_HQ_COL: 20,
        ENEMY_HQ_ROW: 20,
        BASE_COL: 3,
        BASE_ROW: 3,
        RESOURCE_NODE_COORDS: [],
        document: {
            getElementById: () => null
        }
    });
    ctx.globalThis = ctx;

    const i18nCode = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
    vm.runInContext(i18nCode, ctx);

    const mapsCode = fs.readFileSync(path.join(ROOT, 'js', 'maps.js'), 'utf8');
    vm.runInContext(mapsCode, ctx);

    return vm.runInContext(`({
        MAP_CATALOG,
        DIFFICULTY_CONFIGS,
        validateMapDef,
        setDifficulty,
        selectMap,
        applyMapToGrid,
        get grid() { return grid; },
        get HQ_COL() { return HQ_COL; },
        get HQ_ROW() { return HQ_ROW; },
        get ENEMY_HQ_COL() { return ENEMY_HQ_COL; },
        get ENEMY_HQ_ROW() { return ENEMY_HQ_ROW; },
        get BASE_COL() { return BASE_COL; },
        get BASE_ROW() { return BASE_ROW; }
    })`, ctx);
}

describe('MapDef v2 и валидация карт (js/maps.js)', () => {
    let ctx;

    beforeEach(() => {
        ctx = loadMapsContext();
    });

    it('все пресеты в MAP_CATALOG валидны и соответствуют схеме MapDef v2', () => {
        const { MAP_CATALOG, validateMapDef } = ctx;
        const mapKeys = Object.keys(MAP_CATALOG);
        expect(mapKeys).toContain('canyon');
        expect(mapKeys).toContain('arena');
        expect(mapKeys).toContain('maze');
        expect(mapKeys).toContain('crossroads');

        for (const key of mapKeys) {
            const def = MAP_CATALOG[key];
            const res = validateMapDef(def);
            expect(res.errors, `Ошибки в карте "${key}": ${res.errors.join(', ')}`).toEqual([]);
            expect(res.ok).toBe(true);
        }
    });

    it('проверяет инвариант: периметр всех карт состоит из стен #', () => {
        const { MAP_CATALOG } = ctx;
        for (const def of Object.values(MAP_CATALOG)) {
            const size = def.size;
            for (let c = 0; c < size; c++) {
                expect(def.rows[0][c], `Карта ${def.id}: верхний край c=${c}`).toBe('#');
                expect(def.rows[size - 1][c], `Карта ${def.id}: нижний край c=${c}`).toBe('#');
            }
            for (let r = 0; r < size; r++) {
                expect(def.rows[r][0], `Карта ${def.id}: левый край r=${r}`).toBe('#');
                expect(def.rows[r][size - 1], `Карта ${def.id}: правый край r=${r}`).toBe('#');
            }
        }
    });

    it('проверяет инвариант: 3x3 зона вокруг каждой ресурсной точки свободна (.)', () => {
        const { MAP_CATALOG } = ctx;
        for (const def of Object.values(MAP_CATALOG)) {
            for (const node of def.nodes) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const r = node.row + dr, c = node.col + dc;
                        expect(def.rows[r][c], `Карта ${def.id}, узел ${node.id} в (${c}, ${r})`).toBe('.');
                    }
                }
            }
        }
    });

    it('validateMapDef бракует карту с неверной схемой или нарушенным периметром', () => {
        const { MAP_CATALOG, validateMapDef } = ctx;
        const brokenSchema = { ...MAP_CATALOG.canyon, schema: 1 };
        const res1 = validateMapDef(brokenSchema);
        expect(res1.ok).toBe(false);
        expect(res1.errors.some(e => e.includes('Invalid schema'))).toBe(true);

        const brokenPerimeter = JSON.parse(JSON.stringify(MAP_CATALOG.canyon));
        brokenPerimeter.rows[0] = '.' + brokenPerimeter.rows[0].slice(1);
        const res2 = validateMapDef(brokenPerimeter);
        expect(res2.ok).toBe(false);
        expect(res2.errors.some(e => e.includes('borders must be completely filled'))).toBe(true);
    });

    it('validateMapDef выявляет недостижимые ресурсные узлы', () => {
        const { MAP_CATALOG, validateMapDef } = ctx;
        const blockedMap = JSON.parse(JSON.stringify(MAP_CATALOG.canyon));
        // Окружаем точку alpha непроходимыми стенами
        const node = blockedMap.nodes[0];
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                if (Math.abs(dr) === 2 || Math.abs(dc) === 2) {
                    const r = node.row + dr, c = node.col + dc;
                    if (r > 0 && r < 21 && c > 0 && c < 21) {
                        const rowArr = blockedMap.rows[r].split('');
                        rowArr[c] = '#';
                        blockedMap.rows[r] = rowArr.join('');
                    }
                }
            }
        }

        const res = validateMapDef(blockedMap);
        expect(res.ok).toBe(false);
        expect(res.errors.some(e => e.includes('Unreachable resource nodes'))).toBe(true);
    });

    it('applyMapToGrid корректно переносит запечённые стены и позиции в сетку', () => {
        const { applyMapToGrid, grid, MAP_CATALOG } = ctx;
        applyMapToGrid('crossroads');

        const def = MAP_CATALOG.crossroads;
        expect(ctx.HQ_COL).toBe(def.playerHQ.col);
        expect(ctx.HQ_ROW).toBe(def.playerHQ.row);
        expect(ctx.ENEMY_HQ_COL).toBe(def.enemyHQ.col);
        expect(ctx.ENEMY_HQ_ROW).toBe(def.enemyHQ.row);
        expect(ctx.BASE_COL).toBe(def.playerSpawn.col);
        expect(ctx.BASE_ROW).toBe(def.playerSpawn.row);

        for (let r = 0; r < 22; r++) {
            for (let c = 0; c < 22; c++) {
                const expected = def.rows[r][c] === '#' ? 1 : 0;
                expect(grid[r][c], `grid[${r}][${c}] для crossroads`).toBe(expected);
            }
        }
    });
});
