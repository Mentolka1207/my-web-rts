// =============================================================================
// tests/gameplay.test.js — юнит-тесты для геймплейных механик (T-10, T-11)
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function runFile(ctx, relPath) {
    const filename = path.join(ROOT, relPath);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), ctx, { filename });
}

function loadGameplayContext() {
    const ctx = vm.createContext({
        console,
        performance,
        window: { addEventListener() {} },
        document: { getElementById: () => null, addEventListener() {} },
        setTimeout: () => 0,
        fireLaser: () => {},
        showTacticalAlert: () => {},
        syncSeedUI: () => {},
        gameStarted: true,
        gameOver: false
    });
    ctx.globalThis = ctx;

    vm.runInContext(
        fs.readFileSync(path.join(ROOT, 'libs', 'three.min.js'), 'utf8') + ';globalThis.THREE = THREE;',
        ctx,
        { filename: path.join(ROOT, 'libs', 'three.min.js') }
    );

    for (const file of [
        'js/config.js',
        'js/i18n.js',
        'js/perlin.js',
        'js/maps.js',
        'js/prng.js',
        'js/grid.js',
        'js/spatialhash.js',
        'js/flowfield.js',
        'js/fsm.js',
        'js/scene.js',
        'js/healthbar.js',
        'js/models.js',
        'js/units.js',
        'js/resources.js',
        'js/ai.js'
    ]) {
        runFile(ctx, file);
    }

    return ctx;
}

describe('T-10: радиус захвата кристалла выражен через cellSize и синхронизирован с кольцом', () => {
    let ctx;

    beforeEach(() => {
        ctx = loadGameplayContext();
    });

    it.each(['256', '512', '1024'])('на карте %s (CELL_SIZE = 4) CAPTURE_RADIUS = 1.2 * CELL_SIZE (4.8), кольцо совпадает', (sizeId) => {
        vm.runInContext(`currentMapSize = '${sizeId}'; applyMapToGrid('canyon');`, ctx);
        const res = vm.runInContext(`({
            cellSize: CELL_SIZE,
            radius: CAPTURE_RADIUS,
            radiusSq: CAPTURE_RADIUS_SQ,
            ringOuter: resourceNodes.map(n => n.ringMesh ? n.ringMesh.geometry.parameters.outerRadius : null)
        })`, ctx);

        expect(res.cellSize).toBe(4);
        expect(res.radius).toBeCloseTo(4.8, 4);
        expect(res.radiusSq).toBeCloseTo(4.8 * 4.8, 4);
        expect(res.ringOuter.length).toBeGreaterThan(0);
        for (const r of res.ringOuter) {
            expect(r).toBeCloseTo(4.8, 4);
        }
    });

    it('юнит на расстоянии 4.5 (внутри 1.2 * cellSize = 4.8) захватывает точку, а на 5.0 — нет', () => {
        vm.runInContext(`
            currentMapSize = '256';
            applyMapToGrid('canyon');
            units.length = 0;
            enemies.length = 0;
            const node = resourceNodes[0];
            node.owner = 'neutral';
            node.captureProgress = 0;
            createUnit(1, 1, 'standard');
            units[0].mesh.position.set(node.pos.x + 4.5, 0.75, node.pos.z);
            updateResourceNodes(1.0, 1.0);
        `, ctx);
        const insideProgress = vm.runInContext(`resourceNodes[0].captureProgress`, ctx);
        expect(insideProgress).toBeGreaterThan(0);

        vm.runInContext(`(() => {
            const node = resourceNodes[0];
            node.owner = 'neutral';
            node.captureProgress = 0;
            units[0].mesh.position.set(node.pos.x + 5.0, 0.75, node.pos.z);
            updateResourceNodes(1.0, 2.0);
        })();`, ctx);
        const outsideProgress = vm.runInContext(`resourceNodes[0].captureProgress`, ctx);
        expect(outsideProgress).toBe(0);
    });
});

describe('T-11: урон по штабу игрока зависит от типа врага и сложности', () => {
    let ctx;

    beforeEach(() => {
        ctx = loadGameplayContext();
        vm.runInContext(`
            currentMapSize = '256';
            applyMapToGrid('canyon');
            units.length = 0;
            enemies.length = 0;
            spatialGrid.clear();
        `, ctx);
    });

    it.each([
        ['scout', 6],
        ['standard', 12],
        ['tank', 35],
        ['boss', 38]
    ])('на нормальной сложности %s наносит штабу %i урона', (enemyType, expectedDmg) => {
        vm.runInContext(`
            currentDifficulty = 'normal';
            playerHQ.hp = 500;
            enemies.length = 0;
            const hqPos = playerHQ.mesh.position;
            createEnemy(hqPos.x + 2.0, hqPos.z, '${enemyType}', true);
            enemies[0].lastAttackTime = -99;
            updateEnemiesAI(10.0, 1 / 30);
        `, ctx);
        const hpAfter = vm.runInContext(`playerHQ.hp`, ctx);
        expect(500 - hpAfter).toBe(expectedDmg);
    });

    it.each([
        ['easy', 'tank', 28],   // Math.round(35 * 0.8) = 28
        ['normal', 'tank', 35], // Math.round(35 * 1.0) = 35
        ['hard', 'tank', 44]    // Math.round(35 * 1.25) = 44
    ])('сложность %s масштабирует урон %s по штабу до %i', (diff, enemyType, expectedDmg) => {
        vm.runInContext(`
            currentDifficulty = '${diff}';
            playerHQ.hp = 500;
            enemies.length = 0;
            const hqPos = playerHQ.mesh.position;
            createEnemy(hqPos.x + 2.0, hqPos.z, '${enemyType}', true);
            enemies[0].lastAttackTime = -99;
            updateEnemiesAI(10.0, 1 / 30);
        `, ctx);
        const hpAfter = vm.runInContext(`playerHQ.hp`, ctx);
        expect(500 - hpAfter).toBe(expectedDmg);
    });
});

describe('T-07: инициализация флагов отступления и штурм-марша в createUnit + stepUnitFSM', () => {
    it('createUnit задаёт attackMove=false и ignoreAggro=false, режим марша игнорирует врагов без attackMove', () => {
        const ctx = loadGameplayContext();
        vm.runInContext(`(() => {
            currentMapSize = '256';
            applyMapToGrid('canyon');
            units.length = 0;
            enemies.length = 0;
            createUnit(4, 4, 'standard');
            const u = units[0];
            createEnemy(u.mesh.position.x + 3.0, u.mesh.position.z, 'standard', false);
            spatialGrid.clear();
            spatialGrid.insert(u, false);
            spatialGrid.insert(enemies[0], true);
        })()`, ctx);

        const defaults = vm.runInContext(`({ attackMove: units[0].attackMove, ignoreAggro: units[0].ignoreAggro })`, ctx);
        expect(defaults).toEqual({ attackMove: false, ignoreAggro: false });

        // Обычный марш мимо врага
        vm.runInContext(`(() => {
            const u = units[0];
            u.state = States.MOVE;
            u.personalTarget = new THREE.Vector3(u.mesh.position.x + 12, 0.75, u.mesh.position.z);
            u.attackMove = false;
            u.ignoreAggro = true;
            stepUnitFSM(u, 1 / 30, {
                grid,
                gridSize: GRID_SIZE,
                cellSize: CELL_SIZE,
                halfWorld: MAP_WORLD_SIZE * 0.5,
                flowField: flowFieldGen,
                enemyHQ,
                enemies,
                findNearest: (p, r, t) => spatialGrid.findNearest(p, r, t),
                hasLineOfSight,
                findBypassDirection,
                gameTime: 5.0
            });
        })()`, ctx);
        expect(vm.runInContext(`units[0].state`, ctx)).toBe('MOVE');

        // Штурм-марш (attackMove = true) вступает в бой с врагом на пути
        vm.runInContext(`(() => {
            const u = units[0];
            u.attackMove = true;
            u.ignoreAggro = false;
            stepUnitFSM(u, 1 / 30, {
                grid,
                gridSize: GRID_SIZE,
                cellSize: CELL_SIZE,
                halfWorld: MAP_WORLD_SIZE * 0.5,
                flowField: flowFieldGen,
                enemyHQ,
                enemies,
                findNearest: (p, r, t) => spatialGrid.findNearest(p, r, t),
                hasLineOfSight,
                findBypassDirection,
                gameTime: 5.1
            });
        })()`, ctx);
        expect(vm.runInContext(`units[0].state`, ctx)).toBe('CHASE');
    });
});

describe('T-09: баланс волн и скорость марша на больших картах (512 и 1024)', () => {
    it('лимит активных врагов и множитель марша масштабируются по размеру карты (256/512/1024)', () => {
        const ctx = loadGameplayContext();
        const checkSize = (sizeId) => vm.runInContext(
            `currentMapSize = '${sizeId}'; ({ max: getMaxActiveEnemies(), speedMult: getEnemyMarchSpeedMult() })`,
            ctx
        );
        expect(checkSize('256')).toEqual({ max: 50, speedMult: 1.0 });
        expect(checkSize('512')).toEqual({ max: 75, speedMult: 1.5 });
        expect(checkSize('1024')).toEqual({ max: 110, speedMult: 2.6 });
    });

    it('на карте 1024 (canyon) волна доходит до штаба игрока и наносит урон', () => {
        const ctx = loadGameplayContext();
        const result = vm.runInContext(`(() => {
            currentMapSize = '1024';
            currentDifficulty = 'normal';
            applyMapToGrid('canyon');
            units.length = 0;
            enemies.length = 0;
            spatialGrid.clear();
            playerHQ.hp = 500;
            waveNumber = 2; // Волна 3: рой разведчиков + танк
            spawnWave();
            const dt = 0.25;
            let t = 0;
            while (t < 240 && playerHQ.hp === 500) {
                t += dt;
                updateEnemiesAI(t, dt);
            }
            return { hp: playerHQ.hp, arrivedAtSec: t, spawned: enemies.length };
        })()`, ctx);

        expect(result.spawned).toBeGreaterThan(0);
        expect(result.hp).toBeLessThan(500);
        expect(result.arrivedAtSec).toBeLessThan(240);
    });
});

describe('T-12: синхронизация headless_wave_test.js с js/ai.js и DIFFICULTY_CONFIGS', () => {
    const headless = require('../scripts/headless_wave_test.js');

    it('generateWaveRoster берёт состав волн из buildWaveRoster (js/ai.js) и учитывает лимиты карты', () => {
        const sim = headless.loadSimulationContext('normal', '1024');
        const roster10 = headless.generateWaveRoster(10, '1024');
        expect(roster10).toEqual(sim.buildWaveRoster(10, sim.MAX_WAVE_SIZE));
        expect(roster10[0]).toBe('boss');
    });

    it('simulateWaveBattle учитывает сложность DIFFICULTY_CONFIGS и способности юнитов', () => {
        const easyW10 = headless.simulateWaveBattle(10, { difficulty: 'easy', mapSize: '256' });
        const hardW10 = headless.simulateWaveBattle(10, { difficulty: 'hard', mapSize: '256' });
        expect(easyW10.result).toBe('VICTORY');
        expect(easyW10.abilitiesUsed.shield).toBeGreaterThan(0);
        expect(easyW10.abilitiesUsed.siegeShots).toBeGreaterThan(0);
        expect(easyW10.abilitiesUsed.bossVolleys).toBeGreaterThan(0);
        // На высокой сложности волна объективно тяжелее (меньше выживших или дольше бой / поражение)
        const easySurvived = easyW10.alliesSurvived || 0;
        const hardSurvived = hardW10.alliesSurvived || 0;
        expect(easySurvived >= hardSurvived).toBe(true);
    });
});
