// =============================================================================
// tests/simulation.test.js — SoA-симуляция стресс-теста (js/simulation.js):
// коды состояний, упаковка буфера, синхронный шаг, отбрасывание устаревших
// ответов воркеров и совпадение встроенного кода воркера с js/sim_worker.js.
// Регрессии BUG-005 из bugs.md.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import helpers from './helpers/loadGame.js';
const { loadGame } = helpers;

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let game, sim;
beforeEach(() => {
    game = loadGame();
    vm.runInContext(read('js/simulation.js'), game.context, { filename: 'js/simulation.js' });
    sim = vm.runInContext(`({
        SimulationWorkerPool, SIM_WORKER_CODE, SIM_STATE_NAMES, simStateToCode, simCodeToState, States
    })`, game.context);
});

// Минимальный юнит в том виде, в каком его создают js/units.js и js/benchmark.js
function makeUnit(x, z, extra = {}) {
    const { THREE } = game;
    const mesh = new THREE.Object3D();
    mesh.position.set(x, 0.75, z);
    return Object.assign({
        mesh, type: 'standard', state: 'IDLE', personalTarget: null,
        hp: 100, maxHp: 100, speed: 6, radius: 0.45,
        attackRange: 4, attackCooldown: 1.0, damage: 15, lastAttackTime: 0,
        velocity: new THREE.Vector3()
    }, extra);
}

// Пустая сетка 64×64 без стен
const emptyGrid = () => Array.from({ length: 64 }, () => new Array(64).fill(0));

describe('коды состояний FSM в плоском буфере', () => {
    it('строка из States превращается в код и обратно', () => {
        for (const name of ['IDLE', 'MOVE', 'CHASE', 'ATTACK']) {
            expect(sim.simCodeToState(sim.simStateToCode(sim.States[name]))).toBe(sim.States[name]);
        }
    });

    it('неизвестное значение — IDLE, а не NaN', () => {
        expect(sim.simStateToCode('???')).toBe(0);
        expect(sim.simStateToCode(undefined)).toBe(0);
        expect(sim.simStateToCode(7)).toBe(0);
        expect(sim.simCodeToState(NaN)).toBe('IDLE');
    });
});

describe('packGlobalBuffer', () => {
    it('состояние пишется числом: в Float32Array строка стала бы NaN', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.packGlobalBuffer([makeUnit(0, 0, { state: 'MOVE' })], [makeUnit(5, 5, { state: 'ATTACK' })]);
        expect(pool.globalBuffer[10]).toBe(1);
        expect(pool.globalBuffer[16 + 10]).toBe(3);
    });

    it('скорость 0 (танк в осаде) остаётся нулём, а не подменяется значением по умолчанию', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.packGlobalBuffer([makeUnit(0, 0, { type: 'tank', speed: 0 })], [makeUnit(5, 5, { speed: 0 })]);
        expect(pool.globalBuffer[5]).toBe(0);
        expect(pool.globalBuffer[16 + 5]).toBe(0);
    });

    it('в буфер попадает личный кулдаун атаки юнита', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.packGlobalBuffer([makeUnit(0, 0, { attackCooldown: 1.6 })], [makeUnit(5, 5, { attackCooldown: 1.4 })]);
        expect(pool.globalBuffer[7]).toBeCloseTo(1.6, 5);
        expect(pool.globalBuffer[16 + 7]).toBeCloseTo(1.4, 5);
    });
});

describe('stepSync (синхронный шаг без воркеров)', () => {
    it('после шага состояние юнита — строка из States', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.init(emptyGrid(), 256, 4);
        const ally = makeUnit(0, 0);
        const enemy = makeUnit(60, 60);
        pool.stepSync([ally], [enemy], 1 / 30, 10, emptyGrid(), 256, 4, null);
        expect(sim.SIM_STATE_NAMES).toContain(ally.state);
        expect(sim.SIM_STATE_NAMES).toContain(enemy.state);
    });

    it('шаг не создаёт глобальных переменных (раньше diffZ утекала в глобальную область)', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.init(emptyGrid(), 256, 4);
        // два юнита вплотную: срабатывает ветка расталкивания
        pool.stepSync([makeUnit(0, 0), makeUnit(0.2, 0.1)], [makeUnit(60, 60)], 1 / 30, 10, emptyGrid(), 256, 4, null);
        expect(vm.runInContext('typeof diffZ', game.context)).toBe('undefined');
    });

    it('юнит со скоростью 0 не едет к цели', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.init(emptyGrid(), 256, 4);
        const { THREE } = game;
        const tank = makeUnit(0, 0, { type: 'tank', speed: 0, personalTarget: new THREE.Vector3(50, 0.75, 0) });
        for (let i = 0; i < 30; i++) pool.stepSync([tank], [], 1 / 30, i / 30, emptyGrid(), 256, 4, null);
        expect(tank.mesh.position.x).toBeCloseTo(0, 5);
    });

    it('атака идёт с кулдауном юнита, а не по таблице типов', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.init(emptyGrid(), 256, 4);
        const shooter = makeUnit(0, 0, { attackCooldown: 2.0, damage: 10, lastAttackTime: -99 });
        const target = makeUnit(2, 0, { hp: 1000, maxHp: 1000, damage: 0, attackRange: 0.1 });
        // 3 секунды игрового времени: при кулдауне 2.0 — выстрелы на t=0 и t=2
        for (let i = 0; i <= 90; i++) pool.stepSync([shooter], [target], 1 / 30, i / 30, emptyGrid(), 256, 4, null);
        expect(target.hp).toBe(1000 - 20);
    });

    it('после resize на карту 256 юнит у края карты остаётся на месте', () => {
        const pool = new sim.SimulationWorkerPool(64);
        pool.init(null, 44, 2);           // стартовые размеры из config.js
        pool.resize(emptyGrid(), 256, 4); // карта 256×256 после загрузки настроек
        const unit = makeUnit(-110, -110);
        pool.stepSync([unit], [], 1 / 30, 0, emptyGrid(), pool.worldSize, pool.cellSize, null);
        expect(unit.mesh.position.x).toBeCloseTo(-110, 3);
        expect(unit.mesh.position.z).toBeCloseTo(-110, 3);
    });
});

describe('ответы воркеров', () => {
    it('ответ на отменённый шаг не применяется к новым юнитам', () => {
        const pool = new sim.SimulationWorkerPool(64);
        const unit = makeUnit(10, 10);
        pool.activeUnits.push(unit);
        pool.isBusy = true;
        pool.pendingSlices = 1;
        const staleEpoch = pool.stepEpoch;
        pool.clear(); // стресс-тест остановлен, рестарт или смена карты

        const buffer = new Float32Array(16);
        buffer[0] = -999; buffer[1] = -999; buffer[6] = 100;
        pool.activeUnits.push(unit);
        pool.handleWorkerMessage({ data: { type: 'STEP_SLICE_DONE', epoch: staleEpoch, sliceStart: 0, sliceCount: 1, buffer: buffer.buffer, damageEvents: [], laserEvents: [] } });

        expect(unit.mesh.position.x).toBe(10);
        expect(pool.isBusy).toBe(false);
    });
});

describe('код воркера', () => {
    // Строки без комментариев и пустых строк: файлы различаются только пояснениями
    const normalize = (code) => code.split('\n')
        .map(line => line.replace(/\s+\/\/.*$/, '').trimEnd())
        .filter(line => line.trim() !== '' && !/^\s*\/\//.test(line))
        .join('\n');

    it('встроенный Blob-воркер и js/sim_worker.js (запасной путь) — один и тот же код', () => {
        expect(normalize(sim.SIM_WORKER_CODE)).toBe(normalize(read('js/sim_worker.js')));
    });

    it('в коде воркера нет присваивания необъявленной переменной diffZ', () => {
        expect(read('js/sim_worker.js')).not.toMatch(/^\s*diffZ\s*=/m);
        expect(sim.SIM_WORKER_CODE).not.toMatch(/^\s*diffZ\s*=/m);
    });
});
