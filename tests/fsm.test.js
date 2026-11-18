// =============================================================================
// tests/fsm.test.js — модульные тесты чистого FSM (js/fsm.js) без THREE/DOM
// =============================================================================
import { describe, it, expect } from 'vitest';
const fs = require('node:fs');
const path = require('node:path');

const {
    FSM_STATES,
    createFSMEvents,
    clearFSMEvents,
    stepUnitFSM,
    recoverIdleEnemyPatrol
} = require('../js/fsm.js');

const ROOT = path.resolve(__dirname, '..');

function makeGrid(size = 10) {
    return Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) => (r === 0 || c === 0 || r === size - 1 || c === size - 1 ? 1 : 0))
    );
}

function makeFlatField(size, vx = 0, vz = 0, dist = 5) {
    const total = size * size;
    const flowX = new Float32Array(total).fill(vx);
    const flowY = new Float32Array(total).fill(vz);
    const integration = new Uint16Array(total).fill(dist);
    return { width: size, flowX, flowY, integration };
}

function makeUnit(overrides = {}) {
    return {
        type: 'standard',
        hp: 100,
        maxHp: 100,
        speed: 6,
        radius: 0.45,
        damage: 15,
        attackRange: 4.0,
        attackCooldown: 1.0,
        visionRange: 8.0,
        lastAttackTime: -10,
        state: FSM_STATES.IDLE,
        personalTarget: null,
        targetEnemy: null,
        orderTarget: null,
        flowField: null,
        finalApproach: false,
        isSieged: false,
        velocity: { x: 0, y: 0, z: 0 },
        mesh: {
            position: { x: 0, y: 0.75, z: 0 },
            rotation: { y: 0 },
            userData: { velocity: { x: 0, y: 0, z: 0 } }
        },
        ...overrides
    };
}

function makeEnemy(x, z, overrides = {}) {
    return {
        type: 'standard',
        hp: 85,
        maxHp: 85,
        mesh: { position: { x, y: 0.75, z } },
        ...overrides
    };
}

function makeCtx(overrides = {}) {
    const grid = overrides.grid || makeGrid(10);
    const gridSize = grid.length;
    const cellSize = overrides.cellSize || 4;
    return {
        grid,
        gridSize,
        cellSize,
        halfWorld: (gridSize * cellSize) * 0.5,
        flowField: makeFlatField(gridSize, 1, 0, 5),
        enemyHQ: null,
        enemies: [],
        findNearest: () => ({ unit: null, dist: Infinity }),
        gameTime: 10,
        events: createFSMEvents(),
        ...overrides
    };
}

describe('T-05: чистота модуля js/fsm.js', () => {
    it('js/fsm.js не содержит обращений к THREE, document и window', () => {
        const src = fs.readFileSync(path.join(ROOT, 'js', 'fsm.js'), 'utf8');
        expect(src).not.toMatch(/\bTHREE\b/);
        expect(src).not.toMatch(/\bdocument\b/);
        expect(src).not.toMatch(/\bwindow\b/);
    });
});

describe('Базовые переходы состояний IDLE / MOVE / CHASE / ATTACK', () => {
    it('IDLE → CHASE при появлении врага или вражеского штаба в обзоре', () => {
        const enemy = makeEnemy(5, 0);
        const unit = makeUnit({ state: FSM_STATES.IDLE });
        const ctx = makeCtx({ findNearest: () => ({ unit: enemy, dist: 5 }) });

        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.CHASE);
        expect(unit.targetEnemy).toBe(enemy);

        // Вражеский штаб также выбирается при отсутствии более близкого врага
        const u2 = makeUnit({ state: FSM_STATES.IDLE });
        const hq = { hp: 500, mesh: { position: { x: 6, y: 0, z: 0 } } };
        const ctxHq = makeCtx({ enemyHQ: hq });
        stepUnitFSM(u2, 1 / 30, ctxHq);
        expect(u2.state).toBe(FSM_STATES.CHASE);
        expect(u2.targetEnemy).toBe(hq);
    });

    it('MOVE → IDLE при достижении personalTarget в пределах stopThreshold', () => {
        const unit = makeUnit({
            state: FSM_STATES.MOVE,
            personalTarget: { x: 0.2, y: 0.75, z: 0 },
            finalApproach: true
        });
        const ctx = makeCtx();

        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.IDLE);
        expect(unit.personalTarget).toBeNull();
        expect(unit.finalApproach).toBe(false);
        expect(unit.velocity.x).toBe(0);
        expect(unit.velocity.z).toBe(0);
    });

    it('T-07: MOVE без attackMove (отступление / обычный марш) проходит мимо врага и не втягивается в бой', () => {
        const enemy = makeEnemy(4, 0);
        const unit = makeUnit({
            state: FSM_STATES.MOVE,
            personalTarget: { x: 10, y: 0.75, z: 0 },
            attackMove: false,
            ignoreAggro: true
        });
        const ctx = makeCtx({
            findNearest: () => ({ unit: enemy, dist: 4 }),
            hasLineOfSight: () => true
        });

        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.MOVE);
        expect(unit.targetEnemy).toBeNull();
        expect(unit.mesh.position.x).toBeGreaterThan(0);

        // Без явного флага attackMove (по умолчанию false) юнит тоже не отвлекается на врагов
        const uDefault = makeUnit({
            state: FSM_STATES.MOVE,
            personalTarget: { x: 10, y: 0.75, z: 0 }
        });
        stepUnitFSM(uDefault, 1 / 30, ctx);
        expect(uDefault.state).toBe(FSM_STATES.MOVE);
        expect(uDefault.targetEnemy).toBeNull();
    });

    it('T-07: MOVE с attackMove: true переходит в CHASE при обнаружении врага, а после победы продолжает марш к цели и сбрасывает флаг в IDLE', () => {
        const enemy = makeEnemy(3.5, 0, { hp: 10 });
        const unit = makeUnit({
            state: FSM_STATES.MOVE,
            personalTarget: { x: 10, y: 0.75, z: 0 },
            attackMove: true,
            ignoreAggro: false
        });
        const ctx = makeCtx({
            findNearest: () => ({ unit: enemy.hp > 0 ? enemy : null, dist: enemy.hp > 0 ? 3.5 : Infinity }),
            enemies: [enemy],
            gameTime: 12
        });

        stepUnitFSM(unit, 1 / 30, ctx); // MOVE -> CHASE
        expect(unit.state).toBe(FSM_STATES.CHASE);
        expect(unit.targetEnemy).toBe(enemy);

        stepUnitFSM(unit, 1 / 30, ctx); // CHASE -> ATTACK
        expect(unit.state).toBe(FSM_STATES.ATTACK);

        enemy.hp = 0; // Враг уничтожен -> возврат в MOVE к personalTarget с сохранением attackMove
        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.MOVE);
        expect(unit.attackMove).toBe(true);

        // При достижении personalTarget переход в IDLE и сброс флагов приказа
        unit.mesh.position.x = 9.9;
        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.IDLE);
        expect(unit.attackMove).toBe(false);
        expect(unit.ignoreAggro).toBe(false);
    });

    it('CHASE → ATTACK при сближении на <= attackRange и CHASE → MOVE при уходе случайной цели за visionRange', () => {
        const enemy = makeEnemy(3.5, 0);
        const unit = makeUnit({
            state: FSM_STATES.CHASE,
            targetEnemy: enemy,
            personalTarget: { x: 12, y: 0.75, z: 0 }
        });
        const ctx = makeCtx();

        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.ATTACK);

        // Случайная цель вышла далеко за visionRange -> возврат в MOVE
        const uFar = makeUnit({
            state: FSM_STATES.CHASE,
            targetEnemy: makeEnemy(12, 0),
            personalTarget: { x: 15, y: 0.75, z: 0 }
        });
        stepUnitFSM(uFar, 1 / 30, ctx);
        expect(uFar.state).toBe(FSM_STATES.MOVE);
        expect(uFar.targetEnemy).toBeNull();
    });

    it('ATTACK генерирует события damage и laser с учётом attackCooldown и переходит в CHASE при разрыве дистанции', () => {
        const enemy = makeEnemy(3.0, 0);
        const unit = makeUnit({
            state: FSM_STATES.ATTACK,
            targetEnemy: enemy,
            lastAttackTime: 0,
            attackCooldown: 1.0,
            damage: 15
        });
        const ctx = makeCtx({ gameTime: 1.5, enemies: [enemy] });

        // Первый выстрел на t=1.5 проходит
        stepUnitFSM(unit, 1 / 30, ctx);
        expect(ctx.events.damage).toHaveLength(1);
        expect(ctx.events.damage[0]).toMatchObject({ target: enemy, amount: 15, isSplash: false });
        expect(ctx.events.laser).toHaveLength(1);
        expect(ctx.events.laser[0].soundType).toBe('ally');

        // Через 0.2 с (на t=1.7) кулдаун ещё не прошёл -> новых событий нет
        clearFSMEvents(ctx.events);
        ctx.gameTime = 1.7;
        stepUnitFSM(unit, 1 / 30, ctx);
        expect(ctx.events.damage).toHaveLength(0);
        expect(ctx.events.laser).toHaveLength(0);

        // Цель отбежала дальше attackRange -> переход в CHASE
        enemy.mesh.position.x = 6.0;
        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.CHASE);

        // Цель погибла -> возврат в IDLE
        enemy.hp = 0;
        stepUnitFSM(unit, 1 / 30, ctx);
        expect(unit.state).toBe(FSM_STATES.IDLE);
        expect(unit.targetEnemy).toBeNull();
    });
});

describe('Регрессии из bugs.md в чистом FSM', () => {
    it('BUG-007: юнит в MOVE идёт по снимку unit.flowField, игнорируя новый глобальный ctx.flowField', () => {
        const snapField = makeFlatField(10, 0, 1, 5);   // строго по +Z
        const globalField = makeFlatField(10, 1, 0, 5); // чужой приказ по +X
        const unit = makeUnit({
            state: FSM_STATES.MOVE,
            personalTarget: { x: 0, y: 0.75, z: 12 },
            flowField: snapField
        });
        const ctx = makeCtx({
            flowField: globalField,
            hasLineOfSight: () => false
        });

        stepUnitFSM(unit, 0.1, ctx);
        expect(unit.mesh.position.z).toBeGreaterThan(0.5);
        expect(unit.mesh.position.x).toBeCloseTo(0, 5);
    });

    it('BUG-008: при cellsToGoal <= 1 включается finalApproach, а по истечении approachLimit юнит останавливается в IDLE', () => {
        const snapField = makeFlatField(10, 1, 0, 1); // cellsToGoal = 1
        const unit = makeUnit({
            state: FSM_STATES.MOVE,
            personalTarget: { x: 2, y: 0.75, z: 0 },
            flowField: snapField
        });
        const ctx = makeCtx({ hasLineOfSight: () => true });

        stepUnitFSM(unit, 0.05, ctx);
        expect(unit.finalApproach).toBe(true);
        expect(unit.approachLimit).toBeGreaterThan(3);

        // Имитируем заблокированное место: вышло approachLimit -> чистый выход в IDLE
        unit.mesh.position.x = 0;
        unit.approachTime = unit.approachLimit + 0.1;
        stepUnitFSM(unit, 0.05, ctx);
        expect(unit.state).toBe(FSM_STATES.IDLE);
        expect(unit.personalTarget).toBeNull();
        expect(unit.finalApproach).toBe(false);
    });

    it('BUG-009: приказная цель orderTarget не сбрасывается вне visionRange и преследуется по unit.flowField', () => {
        const target = makeEnemy(15, 15);
        const snapField = makeFlatField(10, 0, 1, 8); // обход по +Z
        const unit = makeUnit({
            state: FSM_STATES.CHASE,
            targetEnemy: target,
            orderTarget: target,
            flowField: snapField,
            visionRange: 8.0
        });
        const ctx = makeCtx({ hasLineOfSight: () => false });

        stepUnitFSM(unit, 0.1, ctx);
        expect(unit.state).toBe(FSM_STATES.CHASE);
        expect(unit.targetEnemy).toBe(target);
        expect(unit.mesh.position.z).toBeGreaterThan(0.5);
        expect(unit.mesh.position.x).toBeCloseTo(0, 5);
    });

    it('BUG-011: танк в осаде (attackRange = 8, visionRange = 8.5) атакует врага на дистанции 7.6', () => {
        const enemy = makeEnemy(7.6, 0);
        const tank = makeUnit({
            type: 'tank',
            state: FSM_STATES.IDLE,
            speed: 0,
            damage: 45,
            isSieged: true,
            attackRange: 8.0,
            visionRange: 8.5,
            attackCooldown: 1.6
        });
        const ctx = makeCtx({
            findNearest: () => ({ unit: enemy, dist: 7.6 }),
            enemies: [enemy]
        });

        stepUnitFSM(tank, 1 / 30, ctx); // IDLE -> CHASE
        expect(tank.state).toBe(FSM_STATES.CHASE);
        stepUnitFSM(tank, 1 / 30, ctx); // CHASE -> ATTACK (7.6 <= 8.0)
        expect(tank.state).toBe(FSM_STATES.ATTACK);
        stepUnitFSM(tank, 1 / 30, ctx); // ATTACK -> fire
        expect(ctx.events.damage).toHaveLength(1);
        expect(ctx.events.laser[0].soundType).toBe('heavy');
    });

    it('BUG-017: recoverIdleEnemyPatrol возвращает застрявшего в MOVE без roamTarget патрульного врага в IDLE', () => {
        const patrolEnemy = makeEnemy(0, 0, {
            state: FSM_STATES.MOVE,
            roamTarget: null,
            roamCooldown: 0,
            velocity: { x: 2, y: 0, z: -1 }
        });

        expect(recoverIdleEnemyPatrol(patrolEnemy)).toBe(true);
        expect(patrolEnemy.state).toBe(FSM_STATES.IDLE);
        expect(patrolEnemy.velocity.x).toBe(0);
        expect(patrolEnemy.velocity.z).toBe(0);
        expect(patrolEnemy.roamCooldown).toBe(1.0);
    });

    it('BUG-025: при !hasLineOfSight в MOVE нет 25% тяги к стене — юнит идёт строго по вектору потока', () => {
        const snapField = makeFlatField(10, 0, 1, 5); // поток строго на юг (+Z)
        const unit = makeUnit({
            state: FSM_STATES.MOVE,
            personalTarget: { x: 10, y: 0.75, z: 0 }, // цель на восток (+X) за стеной
            flowField: snapField
        });
        const ctx = makeCtx({ hasLineOfSight: () => false });

        stepUnitFSM(unit, 0.1, ctx);
        expect(unit.mesh.position.x).toBeCloseTo(0, 6);
        expect(unit.mesh.position.z).toBeGreaterThan(0.5);
    });

    it('BUG-027: осадный сплэш создаёт события урона (50%) и hitFlash в радиусе <= 2.2, не задевая дальних', () => {
        const mainTarget = makeEnemy(6.0, 0, { hp: 200 });
        const nearSplash = makeEnemy(7.9, 0, { hp: 100 }); // 1.9 <= 2.2
        const farOutside = makeEnemy(8.5, 0, { hp: 100 }); // 2.5 > 2.2
        const tank = makeUnit({
            type: 'tank',
            state: FSM_STATES.ATTACK,
            targetEnemy: mainTarget,
            isSieged: true,
            speed: 0,
            damage: 45,
            attackRange: 8.0,
            visionRange: 8.5,
            attackCooldown: 1.6,
            lastAttackTime: 0
        });
        const ctx = makeCtx({
            gameTime: 5.0,
            enemies: [mainTarget, nearSplash, farOutside]
        });

        stepUnitFSM(tank, 1 / 30, ctx);
        expect(ctx.events.explosion).toHaveLength(1);
        expect(ctx.events.damage).toHaveLength(2);
        expect(ctx.events.damage[0]).toMatchObject({ target: mainTarget, amount: 45, isSplash: false });
        expect(ctx.events.damage[1]).toMatchObject({ target: nearSplash, amount: 22, isSplash: true });
        expect(ctx.events.hitFlash).toHaveLength(1);
    });
});
