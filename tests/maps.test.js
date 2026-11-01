import { describe, it, expect, beforeEach } from 'vitest';
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadMapsContext() {
    const ctx = vm.createContext({
        console,
        window: { addEventListener() {} },
        THREE: {
            Vector3: class { constructor(x=0,y=0,z=0) { this.x = x; this.y = y; this.z = z; } },
            MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }
        },
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

    const configCode = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
    vm.runInContext(configCode, ctx);

    const perlinCode = fs.readFileSync(path.join(ROOT, 'js', 'perlin.js'), 'utf8');
    vm.runInContext(perlinCode, ctx);

    const mapsCode = fs.readFileSync(path.join(ROOT, 'js', 'maps.js'), 'utf8');
    vm.runInContext(mapsCode, ctx);

    return vm.runInContext(`({
        MAP_CATALOG,
        DIFFICULTY_CONFIGS,
        MAP_SIZE_CONFIGS,
        PERLIN_BIOME_CONFIGS,
        PerlinNoise,
        validateMapDef,
        setDifficulty,
        selectMap,
        setMapSize,
        buildScaledMap,
        applyMapToGrid,
        getMapSeed,
        setMapSeed,
        rerollMapSeed,
        get currentMapSize() { return currentMapSize; },
        set currentMapSize(v) { currentMapSize = v; },
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

    it('MAP_SIZE_CONFIGS содержит корректные параметры для 256, 512, 1024', () => {
        const { MAP_SIZE_CONFIGS } = ctx;
        expect(MAP_SIZE_CONFIGS).toBeDefined();
        const expectedSizes = ['256', '512', '1024'];
        expectedSizes.forEach(s => {
            const conf = MAP_SIZE_CONFIGS[s];
            expect(conf).toBeDefined();
            expect(conf.worldSize).toBe(parseInt(s, 10));
            expect(conf.gridSize).toBeGreaterThan(0);
            expect(conf.cellSize).toBeGreaterThan(0);
            expect(conf.gridSize * conf.cellSize).toBe(conf.worldSize);
            expect(conf.baseCamDist).toBeGreaterThan(0);
            expect(conf.maxCameraDist).toBeGreaterThan(conf.minCameraDist);
            expect(conf.fogFar).toBeGreaterThan(conf.fogNear);
        });
    });

    it('buildScaledMap корректно генерирует и валидирует все 12 комбинаций (4 карты x 3 размера)', () => {
        const { MAP_CATALOG, buildScaledMap, validateMapDef } = ctx;
        const mapKeys = ['canyon', 'arena', 'maze', 'crossroads'];
        const sizeKeys = ['256', '512', '1024'];

        for (const mk of mapKeys) {
            for (const sk of sizeKeys) {
                const scaled = buildScaledMap(MAP_CATALOG[mk], sk);
                expect(scaled.schema).toBe(2);
                expect(scaled.id).toBe(`${mk}-${sk}`);
                expect(['64', '128', '256']).toContain(String(scaled.size));
                expect(scaled.rows).toHaveLength(scaled.size);

                // Проверка инвариантов через валидатор
                const res = validateMapDef(scaled);
                expect(res.errors, `Ошибки в ${mk}-${sk}: ${res.errors.join(', ')}`).toEqual([]);
                expect(res.ok).toBe(true);

                // Проверка количества ресурсных точек
                if (sk === '256') expect(scaled.nodes.length).toBe(5);
                else if (sk === '512') expect(scaled.nodes.length).toBe(7);
                else if (sk === '1024') expect(scaled.nodes.length).toBe(9);
            }
        }
    });

    it('setMapSize переключает текущий размер и обновляет конфигурацию', () => {
        const { setMapSize, currentMapSize } = ctx;
        expect(currentMapSize).toBeNull();

        setMapSize('256', false);
        expect(ctx.currentMapSize).toBe('256');

        setMapSize('512', false);
        expect(ctx.currentMapSize).toBe('512');

        setMapSize('1024', false);
        expect(ctx.currentMapSize).toBe('1024');

        // Невалидный размер сбрасывается в 256
        setMapSize('invalid-size', false);
        expect(ctx.currentMapSize).toBe('256');
    });

    it('PerlinNoise: детерминированность, диапазон значений и многооктавный FBM', () => {
        const { PerlinNoise } = ctx;
        expect(PerlinNoise).toBeDefined();

        const p1 = new PerlinNoise(42);
        const p2 = new PerlinNoise(42);
        const p3 = new PerlinNoise(999);

        // Одинаковый сид дает одинаковые значения
        for (let i = 0; i < 20; i++) {
            const v1 = p1.noise2D(i * 0.15, i * 0.25);
            const v2 = p2.noise2D(i * 0.15, i * 0.25);
            expect(v1).toBe(v2);
            expect(v1).toBeGreaterThanOrEqual(-1.1);
            expect(v1).toBeLessThanOrEqual(1.1);
        }

        // Разные сиды дают разные последовательности
        let diffCount = 0;
        for (let i = 1; i <= 20; i++) {
            const v1 = p1.noise2D(i * 0.73, i * 0.89);
            const v3 = p3.noise2D(i * 0.73, i * 0.89);
            if (Math.abs(v1 - v3) > 0.001) diffCount++;
        }
        expect(diffCount).toBeGreaterThanOrEqual(15);

        // FBM, Ridge, Billow
        const fbm = p1.fbm2D(2.5, 3.5, { octaves: 3, scale: 0.5 });
        expect(fbm).toBeGreaterThanOrEqual(-1.1);
        expect(fbm).toBeLessThanOrEqual(1.1);

        const ridge = p1.ridge2D(2.5, 3.5, { octaves: 2 });
        expect(ridge).toBeGreaterThanOrEqual(-0.2);
        expect(ridge).toBeLessThanOrEqual(1.2);

        const billow = p1.billow2D(2.5, 3.5, { octaves: 2 });
        expect(billow).toBeGreaterThanOrEqual(0);
    });

    it('Процедурные карты: разный рельеф при разных сидах и идентичность при одинаковом', () => {
        const { MAP_CATALOG, buildScaledMap } = ctx;
        const baseDef = MAP_CATALOG.canyon;

        const mapA1 = buildScaledMap(baseDef, '256', 55555);
        const mapA2 = buildScaledMap(baseDef, '256', 55555);
        const mapB  = buildScaledMap(baseDef, '256', 77777);

        // Одинаковый сид -> абсолютно идентичные строки карты
        expect(mapA1.rows).toEqual(mapA2.rows);

        // Разный сид -> разный рельеф
        expect(mapA1.rows).not.toEqual(mapB.rows);
    });

    it('Управление сидом: getMapSeed, setMapSeed, rerollMapSeed', () => {
        const { getMapSeed, setMapSeed, rerollMapSeed } = ctx;

        setMapSeed(123456, false);
        expect(getMapSeed()).toBe(123456);

        // Строковый сид из чисел
        setMapSeed('789012', false);
        expect(getMapSeed()).toBe(789012);

        // Текстовый сид хэшируется в целое число
        setMapSeed('my-tactical-seed', false);
        expect(typeof getMapSeed()).toBe('number');
        expect(getMapSeed()).toBeGreaterThan(0);

        // Reroll генерирует новый сид
        const oldSeed = getMapSeed();
        const newSeed = rerollMapSeed(false);
        expect(newSeed).toBeDefined();
        expect(getMapSeed()).toBe(newSeed);
    });

    it('Биомы Перлина: Лабиринт плотнее Арены по числу стен', () => {
        const { MAP_CATALOG, buildScaledMap } = ctx;
        const seed = 31415;

        const arenaMap = buildScaledMap(MAP_CATALOG.arena, '256', seed);
        const mazeMap = buildScaledMap(MAP_CATALOG.maze, '256', seed);

        const countWalls = (rows) => {
            let count = 0;
            for (let r = 1; r < rows.length - 1; r++) {
                for (let c = 1; c < rows.length - 1; c++) {
                    if (rows[r][c] === '#') count++;
                }
            }
            return count;
        };

        const arenaWalls = countWalls(arenaMap.rows);
        const mazeWalls = countWalls(mazeMap.rows);

        // Лабиринт должен иметь больше стен, чем открытая Арена
        expect(mazeWalls).toBeGreaterThan(arenaWalls);
    });
});
