// =============================================================================
// js/simulation.js — Data-Oriented Architecture (SoA) & Web Worker Manager
// Плоские типизированные массивы (Float32Array, Int32Array, Uint8Array)
// для математической модели мира, физики, коллизий и состояний FSM.
// Поддержка запуска в Web Worker с обменом через Transferable Objects
// и автоматическим прозрачным фоллбэком на главный поток (file:/// совместимость).
// =============================================================================

const MAX_SIM_ENTITIES = 3000;

// Структура массивов (Structure of Arrays) симуляции
class SimulationWorld {
    constructor(maxEntities = MAX_SIM_ENTITIES) {
        this.maxEntities = maxEntities;
        this.activeCount = 0;

        // Позиции и ориентация в мире
        this.posX = new Float32Array(maxEntities);
        this.posY = new Float32Array(maxEntities);
        this.posZ = new Float32Array(maxEntities);
        this.rotY = new Float32Array(maxEntities);

        // Скорости
        this.velX = new Float32Array(maxEntities);
        this.velZ = new Float32Array(maxEntities);

        // Здоровье и щиты
        this.hp = new Float32Array(maxEntities);
        this.maxHp = new Float32Array(maxEntities);
        this.shield = new Float32Array(maxEntities);
        this.maxShield = new Float32Array(maxEntities);

        // Характеристики
        this.speed = new Float32Array(maxEntities);
        this.radius = new Float32Array(maxEntities);
        this.visionRange = new Float32Array(maxEntities);
        this.attackRange = new Float32Array(maxEntities);
        this.damage = new Float32Array(maxEntities);
        this.attackCooldown = new Float32Array(maxEntities);
        this.lastAttackTime = new Float32Array(maxEntities);

        // Навигация и цели
        this.targetX = new Float32Array(maxEntities);
        this.targetZ = new Float32Array(maxEntities);
        this.hasTarget = new Uint8Array(maxEntities);
        this.targetEnemyId = new Int32Array(maxEntities);

        // Метаданные и состояния FSM
        this.state = new Uint8Array(maxEntities);       // 0: IDLE, 1: MOVE, 2: CHASE, 3: ATTACK
        this.unitType = new Uint8Array(maxEntities);    // 0: standard, 1: scout, 2: tank, 3: boss
        this.team = new Uint8Array(maxEntities);        // 0: ally, 1: enemy
        this.selected = new Uint8Array(maxEntities);
        this.isSieged = new Uint8Array(maxEntities);
        this.abilityActive = new Uint8Array(maxEntities);
        this.abilityTimer = new Float32Array(maxEntities);
        this.active = new Uint8Array(maxEntities);

        // Стек свободных индексов для O(1) аллокации
        this.freeIndices = [];
        for (let i = maxEntities - 1; i >= 0; i--) {
            this.freeIndices.push(i);
        }

        // Буфер для Transferable сериализации
        this.exportBuffer = new Float32Array(maxEntities * 16);
    }

    // Резервирование слота для нового юнита
    spawn(team, type, x, z, hp, maxHp, speed, radius, visionRange, attackRange, damage, attackCooldown) {
        if (this.freeIndices.length === 0) return -1;
        const id = this.freeIndices.pop();

        this.active[id] = 1;
        this.team[id] = team;
        this.unitType[id] = type;
        this.posX[id] = x;
        this.posY[id] = 0.75;
        this.posZ[id] = z;
        this.rotY[id] = 0;
        this.velX[id] = 0;
        this.velZ[id] = 0;

        this.hp[id] = hp;
        this.maxHp[id] = maxHp;
        this.shield[id] = 0;
        this.maxShield[id] = 50;

        this.speed[id] = speed;
        this.radius[id] = radius;
        this.visionRange[id] = visionRange;
        this.attackRange[id] = attackRange;
        this.damage[id] = damage;
        this.attackCooldown[id] = attackCooldown;
        this.lastAttackTime[id] = -99;

        this.targetX[id] = 0;
        this.targetZ[id] = 0;
        this.hasTarget[id] = 0;
        this.targetEnemyId[id] = -1;

        this.state[id] = 0; // IDLE
        this.selected[id] = 0;
        this.isSieged[id] = 0;
        this.abilityActive[id] = 0;
        this.abilityTimer[id] = 0;

        this.activeCount++;
        return id;
    }

    // Освобождение слота
    kill(id) {
        if (id < 0 || id >= this.maxEntities || !this.active[id]) return;
        this.active[id] = 0;
        this.hp[id] = 0;
        this.freeIndices.push(id);
        this.activeCount = Math.max(0, this.activeCount - 1);
    }

    // Сброс всех юнитов (для тестов/бенчмарка)
    clear() {
        this.active.fill(0);
        this.hp.fill(0);
        this.freeIndices.length = 0;
        for (let i = this.maxEntities - 1; i >= 0; i--) {
            this.freeIndices.push(i);
        }
        this.activeCount = 0;
    }

    // Синхронизация данных из SoA в легковесные JS-объекты юнитов
    syncToObjects(allies, enemiesList) {
        for (let i = 0; i < allies.length; i++) {
            const u = allies[i];
            const id = u.simId;
            if (id === undefined || id < 0 || !this.active[id]) continue;
            u.mesh.position.x = this.posX[id];
            u.mesh.position.z = this.posZ[id];
            u.hp = this.hp[id];
            u.shield = this.shield[id];
            u.state = this.state[id];
            if (u.velocity) {
                u.velocity.x = this.velX[id];
                u.velocity.z = this.velZ[id];
            }
        }

        for (let i = 0; i < enemiesList.length; i++) {
            const e = enemiesList[i];
            const id = e.simId;
            if (id === undefined || id < 0 || !this.active[id]) continue;
            e.mesh.position.x = this.posX[id];
            e.mesh.position.z = this.posZ[id];
            e.hp = this.hp[id];
            e.shield = this.shield[id];
            e.state = this.state[id];
            if (e.velocity) {
                e.velocity.x = this.velX[id];
                e.velocity.z = this.velZ[id];
            }
        }
    }

    // Синхронизация из JS-объектов в SoA (при спавне или изменении приказов)
    syncFromObject(u, simId) {
        if (simId < 0 || simId >= this.maxEntities) return;
        this.posX[simId] = u.mesh.position.x;
        this.posZ[simId] = u.mesh.position.z;
        this.hp[simId] = u.hp;
        this.maxHp[simId] = u.maxHp;
        this.shield[simId] = u.shield || 0;
        this.maxShield[simId] = u.maxShield || 50;
        this.state[simId] = u.state;
        this.selected[simId] = u.selected ? 1 : 0;
        this.isSieged[simId] = u.isSieged ? 1 : 0;
        if (u.personalTarget) {
            this.targetX[simId] = u.personalTarget.x;
            this.targetZ[simId] = u.personalTarget.z;
            this.hasTarget[simId] = 1;
        } else {
            this.hasTarget[simId] = 0;
        }
    }

    // Упаковка в плоский Transferable Float32Array для передачи в другой поток
    packExportBuffer() {
        let offset = 0;
        for (let i = 0; i < this.maxEntities; i++) {
            if (!this.active[i]) continue;
            this.exportBuffer[offset++] = this.posX[i];
            this.exportBuffer[offset++] = this.posY[i];
            this.exportBuffer[offset++] = this.posZ[i];
            this.exportBuffer[offset++] = this.rotY[i];
            this.exportBuffer[offset++] = this.velX[i];
            this.exportBuffer[offset++] = this.velZ[i];
            this.exportBuffer[offset++] = this.hp[i];
            this.exportBuffer[offset++] = this.maxHp[i];
            this.exportBuffer[offset++] = this.shield[i];
            this.exportBuffer[offset++] = this.maxShield[i];
            this.exportBuffer[offset++] = this.state[i];
            this.exportBuffer[offset++] = this.unitType[i];
            this.exportBuffer[offset++] = this.team[i];
            this.exportBuffer[offset++] = this.selected[i];
            this.exportBuffer[offset++] = this.isSieged[i];
            this.exportBuffer[offset++] = i; // entity ID
        }
        return offset;
    }

    // Распаковка полученного буфера из воркера
    unpackExportBuffer(buffer, floatCount) {
        const data = new Float32Array(buffer);
        let offset = 0;
        while (offset < floatCount) {
            const posX = data[offset++];
            const posY = data[offset++];
            const posZ = data[offset++];
            const rotY = data[offset++];
            const velX = data[offset++];
            const velZ = data[offset++];
            const hp = data[offset++];
            const maxHp = data[offset++];
            const shield = data[offset++];
            const maxShield = data[offset++];
            const state = data[offset++];
            const unitType = data[offset++];
            const team = data[offset++];
            const selected = data[offset++];
            const isSieged = data[offset++];
            const id = data[offset++];

            if (id >= 0 && id < this.maxEntities) {
                this.posX[id] = posX;
                this.posY[id] = posY;
                this.posZ[id] = posZ;
                this.rotY[id] = rotY;
                this.velX[id] = velX;
                this.velZ[id] = velZ;
                this.hp[id] = hp;
                this.maxHp[id] = maxHp;
                this.shield[id] = shield;
                this.maxShield[id] = maxShield;
                this.state[id] = state;
                this.selected[id] = selected;
                this.isSieged[id] = isSieged;
            }
        }
    }
}

// Глобальный экземпляр мира симуляции
const simWorld = new SimulationWorld();

// Менеджер Web Worker
const simWorkerManager = {
    worker: null,
    isWorkerActive: false,
    pendingStep: false,

    init() {
        // Проверка протокола: file:/// в ряде браузеров блокирует создание Worker по соображениям безопасности
        try {
            if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:') {
                this.worker = new Worker('js/sim_worker.js');
                this.worker.onmessage = this.handleWorkerMessage.bind(this);
                this.worker.onerror = (err) => {
                    console.warn('Sim Worker encountered an error, falling back to main-thread SoA:', err);
                    this.isWorkerActive = false;
                };
                this.isWorkerActive = true;
                console.log('🚀 Simulation Web Worker инициализирован (Multi-Threaded SoA)');
            } else {
                console.log('⚡ Автономный режим (file:///): SoA симуляция активна в главном потоке');
                this.isWorkerActive = false;
            }
        } catch (e) {
            console.warn('Не удалось запустить Web Worker, используется SoA симуляция в основном потоке:', e);
            this.isWorkerActive = false;
        }
    },

    handleWorkerMessage(e) {
        const msg = e.data;
        if (msg.type === 'STEP_DONE') {
            simWorld.unpackExportBuffer(msg.buffer, msg.count);
            this.pendingStep = false;
        }
    },

    // Отправка шага симуляции в воркер или синхронное выполнение
    step(delta, currentTime) {
        if (this.isWorkerActive && this.worker && !this.pendingStep) {
            this.pendingStep = true;
            this.worker.postMessage({
                type: 'STEP',
                delta: delta,
                currentTime: currentTime
            });
        }
    }
};
