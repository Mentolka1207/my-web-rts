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
