// =============================================================================
// js/simulation.js — Data-Oriented Architecture (SoA) & Multi-Core Worker Pool
// Плоские типизированные массивы (Float32Array, Int32Array, Uint8Array)
// для математической модели мира, физики, коллизий и состояний FSM.
// Поддержка параллельного пула Web Worker (multi-threading на N ядер CPU)
// с автоматическим фоллбэком на высокопроизводительный SoA в главном потоке.
// =============================================================================

const MAX_SIM_ENTITIES = 15000;

// Коды состояний FSM в плоском буфере. В игровых объектах состояние — строка из States
// (js/config.js), в Float32Array строку положить нельзя: она превращается в NaN.
const SIM_STATE_NAMES = ['IDLE', 'MOVE', 'CHASE', 'ATTACK'];
function simStateToCode(state) {
    if (typeof state === 'number') return (state >= 0 && state <= 3) ? state : 0;
    const idx = SIM_STATE_NAMES.indexOf(state);
    return idx === -1 ? 0 : idx;
}
function simCodeToState(code) {
    return SIM_STATE_NAMES[code] || SIM_STATE_NAMES[0];
}

// Scratch векторы для лазеров симуляции (Zero-Allocation)
const _simV1 = (typeof THREE !== 'undefined') ? new THREE.Vector3() : { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const _simV2 = (typeof THREE !== 'undefined') ? new THREE.Vector3() : { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

// Исходный код воркера для мгновенного создания Blob Worker (zero CORS / zero network delay)
const SIM_WORKER_CODE = `
let workerId = 0;
let totalWorkers = 1;
let workerGrid = null;
let gridSize = 64;
let worldSize = 256;
let cellSize = 4;
let halfWorld = 128;
let maxBound = 120;

let allyFlowX = null;
let allyFlowY = null;
let enemyFlowX = null;
let enemyFlowY = null;

let bCellSize = 6.0;
let bCols = 0;
let bRows = 0;
let bTotal = 0;
let bHead = null;
let bNext = null;

let sliceResultBuffer = null;
const damageEvents = [];
const laserEvents = [];

self.onmessage = function (e) {
    const msg = e.data;
    if (!msg) return;

    switch (msg.type) {
        case 'INIT': {
            workerId = msg.workerId || 0;
            totalWorkers = msg.totalWorkers || 1;
            gridSize = msg.gridSize || 64;
            worldSize = msg.worldSize || 256;
            cellSize = msg.cellSize || 4;
            halfWorld = worldSize * 0.5;
            maxBound = halfWorld - (cellSize * 1.05);

            workerGrid = msg.grid || null;

            bCellSize = msg.bCellSize || 6.0;
            bCols = Math.ceil(worldSize / bCellSize);
            bRows = Math.ceil(worldSize / bCellSize);
            bTotal = bCols * bRows;

            bHead = new Int32Array(bTotal);
            bNext = new Int32Array(15000);

            self.postMessage({ type: 'READY', workerId: workerId });
            break;
        }

        case 'SET_FLOW': {
            allyFlowX = msg.allyFlowX ? new Float32Array(msg.allyFlowX) : null;
            allyFlowY = msg.allyFlowY ? new Float32Array(msg.allyFlowY) : null;
            enemyFlowX = msg.enemyFlowX ? new Float32Array(msg.enemyFlowX) : null;
            enemyFlowY = msg.enemyFlowY ? new Float32Array(msg.enemyFlowY) : null;
            break;
        }

        case 'RESIZE': {
            gridSize = msg.gridSize || gridSize;
            worldSize = msg.worldSize || worldSize;
            cellSize = msg.cellSize || cellSize;
            halfWorld = worldSize * 0.5;
            maxBound = halfWorld - (cellSize * 1.05);
            workerGrid = msg.grid || workerGrid;
            bCols = Math.ceil(worldSize / bCellSize);
            bRows = Math.ceil(worldSize / bCellSize);
            bTotal = bCols * bRows;
            bHead = new Int32Array(bTotal);
            break;
        }

        case 'STEP_SLICE': {
            const globalBuffer = new Float32Array(msg.globalBuffer);
            const totalUnits = msg.totalUnits;
            const sliceStart = msg.sliceStart;
            const sliceCount = msg.sliceCount;
            const delta = msg.delta || 0.033;
            const currentTime = msg.currentTime || 0;
            const hq = msg.hqData || null;
            const collisionMode = msg.collisionMode || 'spatial';

            const neededLen = sliceCount * 16;
            if (!sliceResultBuffer || sliceResultBuffer.length < neededLen) {
                sliceResultBuffer = new Float32Array(neededLen);
            }

            damageEvents.length = 0;
            laserEvents.length = 0;

            bHead.fill(-1);
            if (bNext.length < totalUnits) {
                bNext = new Int32Array(Math.max(15000, totalUnits * 2));
            }

            for (let i = 0; i < totalUnits; i++) {
                const off = i * 16;
                const hp = globalBuffer[off + 6];
                if (hp <= 0) continue;

                const ux = globalBuffer[off];
                const uz = globalBuffer[off + 1];

                const bc = ((ux + halfWorld) / bCellSize) | 0;
                const br = ((uz + halfWorld) / bCellSize) | 0;

                if (bc >= 0 && bc < bCols && br >= 0 && br < bRows) {
                    const bIdx = br * bCols + bc;
                    bNext[i] = bHead[bIdx];
                    bHead[bIdx] = i;
                } else {
                    bNext[i] = -1;
                }
            }

            let outOffset = 0;
            const sliceEnd = sliceStart + sliceCount;

            for (let i = sliceStart; i < sliceEnd; i++) {
                const uOff = i * 16;
                let x = globalBuffer[uOff];
                let z = globalBuffer[uOff + 1];
                let vx = globalBuffer[uOff + 2];
                let vz = globalBuffer[uOff + 3];
                const r = globalBuffer[uOff + 4];
                const speed = globalBuffer[uOff + 5];
                const hp = globalBuffer[uOff + 6];
                const attCd = globalBuffer[uOff + 7];
                const team = globalBuffer[uOff + 8];
                const uType = globalBuffer[uOff + 9];
                let state = globalBuffer[uOff + 10];
                const tx = globalBuffer[uOff + 11];
                const tz = globalBuffer[uOff + 12];
                const attRange = globalBuffer[uOff + 13];
                const dmg = globalBuffer[uOff + 14];
                let lastAtt = globalBuffer[uOff + 15];

                if (hp > 0) {
                    const bc = Math.max(0, Math.min(bCols - 1, ((x + halfWorld) / bCellSize) | 0));
                    const br = Math.max(0, Math.min(bRows - 1, ((z + halfWorld) / bCellSize) | 0));

                    let nearestEnemyIdx = -1;
                    let nearestDistSq = attRange * attRange * 4.0;
                    let targetX = 0;
                    let targetZ = 0;

                    if (collisionMode === 'naive') {
                        const maxTest = Math.min(totalUnits, 500);
                        for (let j = 0; j < maxTest; j++) {
                            if (j === i) continue;
                            const cOff = j * 16;
                            const candTeam = globalBuffer[cOff + 8];
                            const candHp = globalBuffer[cOff + 6];

                            if (candTeam !== team && candHp > 0) {
                                const ex = globalBuffer[cOff];
                                const ez = globalBuffer[cOff + 1];
                                const dX = ex - x;
                                const dZ = ez - z;
                                const dSq = dX * dX + dZ * dZ;

                                if (dSq < nearestDistSq) {
                                    nearestDistSq = dSq;
                                    nearestEnemyIdx = j;
                                    targetX = ex;
                                    targetZ = ez;
                                }
                            }
                        }
                    } else {
                        for (let dr = -1; dr <= 1; dr++) {
                            const nbr = br + dr;
                            if (nbr < 0 || nbr >= bRows) continue;
                            const rowOff = nbr * bCols;

                            for (let dc = -1; dc <= 1; dc++) {
                                const nbc = bc + dc;
                                if (nbc < 0 || nbc >= bCols) continue;

                                let candIdx = bHead[rowOff + nbc];
                                while (candIdx !== -1) {
                                    const cOff = candIdx * 16;
                                    const candTeam = globalBuffer[cOff + 8];
                                    const candHp = globalBuffer[cOff + 6];

                                    if (candTeam !== team && candHp > 0) {
                                        const ex = globalBuffer[cOff];
                                        const ez = globalBuffer[cOff + 1];
                                        const dX = ex - x;
                                        const dZ = ez - z;
                                        const dSq = dX * dX + dZ * dZ;

                                        if (dSq < nearestDistSq) {
                                            nearestDistSq = dSq;
                                            nearestEnemyIdx = candIdx;
                                            targetX = ex;
                                            targetZ = ez;
                                        }
                                    }
                                    candIdx = bNext[candIdx];
                                }
                            }
                        }
                    }

                    if (hq) {
                        const targetHQX = (team === 0) ? hq.enemyX : hq.playerX;
                        const targetHQZ = (team === 0) ? hq.enemyZ : hq.playerZ;
                        const targetHQHp = (team === 0) ? hq.enemyHp : hq.playerHp;
                        if (targetHQHp > 0) {
                            const dX = targetHQX - x;
                            const dZ = targetHQZ - z;
                            const dSq = dX * dX + dZ * dZ;
                            if (dSq < nearestDistSq) {
                                nearestDistSq = dSq;
                                nearestEnemyIdx = -99;
                                targetX = targetHQX;
                                targetZ = targetHQZ;
                            }
                        }
                    }

                    if (nearestEnemyIdx !== -1) {
                        const dist = Math.sqrt(nearestDistSq);
                        if (dist <= attRange) {
                            state = 3; // ATTACK
                            vx = 0; vz = 0;

                            const cooldown = attCd > 0 ? attCd : 1.0;
                            if (currentTime - lastAtt >= cooldown) {
                                lastAtt = currentTime;
                                if (nearestEnemyIdx >= 0) {
                                    damageEvents.push(nearestEnemyIdx, dmg, team);
                                } else if (nearestEnemyIdx === -99) {
                                    damageEvents.push(-99, dmg, team);
                                }
                                laserEvents.push(x, z, targetX, targetZ, team, uType);
                            }
                        } else {
                            state = 2; // CHASE
                            const dx = (targetX - x) / dist;
                            const dz = (targetZ - z) / dist;
                            vx = dx * speed;
                            vz = dz * speed;
                        }
                    } else if (tx !== 0 || tz !== 0) {
                        state = 1; // MOVE
                        let dirX = 0, dirZ = 0;

                        const flowX = (team === 0) ? allyFlowX : enemyFlowX;
                        const flowY = (team === 0) ? allyFlowY : enemyFlowY;
                        if (flowX && flowY && cellSize > 0) {
                            const gc = Math.floor((x + halfWorld) / cellSize);
                            const gr = Math.floor((z + halfWorld) / cellSize);
                            if (gc >= 0 && gc < gridSize && gr >= 0 && gr < gridSize) {
                                const cIdx = gr * gridSize + gc;
                                dirX = flowX[cIdx] || 0;
                                dirZ = flowY[cIdx] || 0;
                            }
                        }

                        if (dirX === 0 && dirZ === 0) {
                            const dx = tx - x;
                            const dz = tz - z;
                            const d = Math.hypot(dx, dz);
                            if (d > 0.4) {
                                dirX = dx / d;
                                dirZ = dz / d;
                            }
                        }

                        if (dirX !== 0 || dirZ !== 0) {
                            vx = dirX * speed;
                            vz = dirZ * speed;
                        } else {
                            state = 0; // IDLE
                            vx = 0; vz = 0;
                        }
                    } else {
                        state = 0; // IDLE
                        vx = 0; vz = 0;
                    }

                    let sepX = 0, sepZ = 0;
                    if (collisionMode === 'naive') {
                        const maxSep = Math.min(totalUnits, 300);
                        for (let j = 0; j < maxSep; j++) {
                            if (j !== i) {
                                const oOff = j * 16;
                                const ox = globalBuffer[oOff];
                                const oz = globalBuffer[oOff + 1];
                                const oRad = globalBuffer[oOff + 4];
                                const minD = r + oRad;

                                const diffX = x - ox;
                                const diffZ = z - oz;
                                const dSq = diffX * diffX + diffZ * diffZ;

                                if (dSq < minD * minD && dSq > 0.000001) {
                                    const d = Math.sqrt(dSq);
                                    const push = (minD - d) * 0.5;
                                    sepX += (diffX / d) * push;
                                    sepZ += (diffZ / d) * push;
                                }
                            }
                        }
                    } else {
                        for (let dr = -1; dr <= 1; dr++) {
                            const nbr = br + dr;
                            if (nbr < 0 || nbr >= bRows) continue;
                            const rowOff = nbr * bCols;

                            for (let dc = -1; dc <= 1; dc++) {
                                const nbc = bc + dc;
                                if (nbc < 0 || nbc >= bCols) continue;

                                let otherIdx = bHead[rowOff + nbc];
                                while (otherIdx !== -1) {
                                    if (otherIdx !== i) {
                                        const oOff = otherIdx * 16;
                                        const ox = globalBuffer[oOff];
                                        const oz = globalBuffer[oOff + 1];
                                        const oRad = globalBuffer[oOff + 4];
                                        const minD = r + oRad;

                                        const diffX = x - ox;
                                        const diffZ = z - oz;
                                        const dSq = diffX * diffX + diffZ * diffZ;

                                        if (dSq < minD * minD && dSq > 0.000001) {
                                            const d = Math.sqrt(dSq);
                                            const push = (minD - d) * 0.5;
                                            sepX += (diffX / d) * push;
                                            sepZ += (diffZ / d) * push;
                                        }
                                    }
                                    otherIdx = bNext[otherIdx];
                                }
                            }
                        }
                    }

                    x += (vx * delta) + sepX;
                    z += (vz * delta) + sepZ;

                    if (x < -maxBound) x = -maxBound;
                    else if (x > maxBound) x = maxBound;
                    if (z < -maxBound) z = -maxBound;
                    else if (z > maxBound) z = maxBound;

                    if (workerGrid && cellSize > 0) {
                        const gc = Math.floor((x + halfWorld) / cellSize);
                        const gr = Math.floor((z + halfWorld) / cellSize);
                        if (gc >= 0 && gc < gridSize && gr >= 0 && gr < gridSize && workerGrid[gr] && workerGrid[gr][gc] === 1) {
                            const cellCenterX = (gc + 0.5) * cellSize - halfWorld;
                            const cellCenterZ = (gr + 0.5) * cellSize - halfWorld;
                            const pushDirX = x - cellCenterX;
                            const pushDirZ = z - cellCenterZ;
                            const pLen = Math.hypot(pushDirX, pushDirZ) || 0.001;
                            const pushX = pushDirX / pLen;
                            const pushZ = pushDirZ / pLen;
                            x = cellCenterX + pushX * (cellSize * 0.72);
                            z = cellCenterZ + pushZ * (cellSize * 0.72);

                            const dot = vx * (-pushX) + vz * (-pushZ);
                            if (dot > 0) {
                                vx += pushX * dot;
                                vz += pushZ * dot;
                            }
                        }
                    }
                }

                sliceResultBuffer[outOffset++] = x;
                sliceResultBuffer[outOffset++] = z;
                sliceResultBuffer[outOffset++] = vx;
                sliceResultBuffer[outOffset++] = vz;
                sliceResultBuffer[outOffset++] = r;
                sliceResultBuffer[outOffset++] = speed;
                sliceResultBuffer[outOffset++] = hp;
                sliceResultBuffer[outOffset++] = attCd;
                sliceResultBuffer[outOffset++] = team;
                sliceResultBuffer[outOffset++] = uType;
                sliceResultBuffer[outOffset++] = state;
                sliceResultBuffer[outOffset++] = tx;
                sliceResultBuffer[outOffset++] = tz;
                sliceResultBuffer[outOffset++] = attRange;
                sliceResultBuffer[outOffset++] = dmg;
                sliceResultBuffer[outOffset++] = lastAtt;
            }

            self.postMessage(
                {
                    type: 'STEP_SLICE_DONE',
                    workerId: workerId,
                    epoch: msg.epoch || 0,
                    sliceStart: sliceStart,
                    sliceCount: sliceCount,
                    buffer: sliceResultBuffer.buffer,
                    damageEvents: damageEvents,
                    laserEvents: laserEvents
                },
                [sliceResultBuffer.buffer]
            );
            sliceResultBuffer = null;
            break;
        }

        default:
            break;
    }
};
`;

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

        this.state[id] = 0;
        this.selected[id] = 0;
        this.isSieged[id] = 0;
        this.abilityActive[id] = 0;
        this.abilityTimer[id] = 0;

        this.activeCount++;
        return id;
    }

    kill(id) {
        if (id < 0 || id >= this.maxEntities || !this.active[id]) return;
        this.active[id] = 0;
        this.hp[id] = 0;
        this.freeIndices.push(id);
        this.activeCount = Math.max(0, this.activeCount - 1);
    }

    clear() {
        this.active.fill(0);
        this.hp.fill(0);
        this.freeIndices.length = 0;
        for (let i = this.maxEntities - 1; i >= 0; i--) {
            this.freeIndices.push(i);
        }
        this.activeCount = 0;
    }

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
            this.exportBuffer[offset++] = i;
        }
        return offset;
    }

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

// =============================================================================
// SimulationWorkerPool — Пул многопоточных Web Workers (Multi-Core Processing)
// =============================================================================
class SimulationWorkerPool {
    constructor(maxEntities = MAX_SIM_ENTITIES) {
        this.maxEntities = maxEntities;
        this.hardwareThreads = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
        this.threadCount = Math.min(16, Math.max(2, this.hardwareThreads));
        this.workers = [];
        this.isMultiThreaded = false;
        this.isBusy = false;
        this.enabled = true;

        this.grid = null;
        this.gridSize = 64;
        this.worldSize = 256;
        this.cellSize = 4;

        this.activeUnits = [];
        this.globalBuffer = new Float32Array(maxEntities * 16);
        this.pendingSlices = 0;
        this.sliceResults = [];

        this.damageEventsQueue = [];
        this.laserEventsQueue = [];

        this.allyFlowX = null;
        this.allyFlowY = null;
        this.enemyFlowX = null;
        this.enemyFlowY = null;

        this.lastStepDuration = 0;
        this.stepStartTime = 0;
        this.stepCount = 0;
        // Номер поколения шага: ответы воркеров с другим номером устарели (сброс, рестарт, смена карты)
        this.stepEpoch = 0;

        // Память для быстрого фоллбэка на главном потоке (Single-Thread Linked-List SoA)
        this.syncHead = null;
        this.syncNext = new Int32Array(maxEntities);
    }

    clear() {
        this.activeUnits.length = 0;
        this.pendingSlices = 0;
        this.sliceResults.length = 0;
        this.damageEventsQueue.length = 0;
        this.laserEventsQueue.length = 0;
        this.isBusy = false;
        this.stepEpoch++;
        if (this.syncHead) this.syncHead.fill(-1);
    }

    updateFlowFields(allyFlowGen, enemyFlowGen) {
        if (allyFlowGen && allyFlowGen.fieldX && allyFlowGen.fieldY) {
            this.allyFlowX = allyFlowGen.fieldX;
            this.allyFlowY = allyFlowGen.fieldY;
        }
        if (enemyFlowGen && enemyFlowGen.fieldX && enemyFlowGen.fieldY) {
            this.enemyFlowX = enemyFlowGen.fieldX;
            this.enemyFlowY = enemyFlowGen.fieldY;
        }

        if (this.isMultiThreaded) {
            for (let i = 0; i < this.workers.length; i++) {
                this.workers[i].postMessage({
                    type: 'SET_FLOW',
                    allyFlowX: this.allyFlowX ? this.allyFlowX.buffer.slice(0) : null,
                    allyFlowY: this.allyFlowY ? this.allyFlowY.buffer.slice(0) : null,
                    enemyFlowX: this.enemyFlowX ? this.enemyFlowX.buffer.slice(0) : null,
                    enemyFlowY: this.enemyFlowY ? this.enemyFlowY.buffer.slice(0) : null
                });
            }
        }
    }

    terminate() {
        for (let i = 0; i < this.workers.length; i++) {
            if (this.workers[i]) {
                try { this.workers[i].terminate(); } catch (e) {}
            }
        }
        this.workers.length = 0;
        this.isMultiThreaded = false;
        this.isBusy = false;
        this.pendingSlices = 0;
        this.stepEpoch++;
    }

    init(grid, worldSize = 256, cellSize = 4) {
        this.terminate();

        this.grid = grid || (typeof window !== 'undefined' && window.grid ? window.grid : null);
        this.worldSize = worldSize;
        this.cellSize = cellSize;
        this.gridSize = Math.round(this.worldSize / this.cellSize);

        const bCols = Math.ceil(this.worldSize / 6.0);
        const bRows = Math.ceil(this.worldSize / 6.0);
        this.syncHead = new Int32Array(bCols * bRows);

        if (typeof Worker === 'undefined') {
            console.log('⚡ Web Workers не поддерживаются в данном окружении. SoA симуляция активна в основном потоке.');
            this.isMultiThreaded = false;
            return;
        }

        let blobUrl = null;
        try {
            const blob = new Blob([SIM_WORKER_CODE], { type: 'application/javascript' });
            blobUrl = URL.createObjectURL(blob);
        } catch (e) {
            blobUrl = null;
        }

        const createdWorkers = [];
        for (let i = 0; i < this.threadCount; i++) {
            let w = null;
            try {
                if (blobUrl) {
                    w = new Worker(blobUrl);
                } else {
                    w = new Worker('js/sim_worker.js');
                }
            } catch (errBlob) {
                try {
                    w = new Worker('js/sim_worker.js');
                } catch (errFile) {
                    console.warn(`Не удалось создать Worker #${i}:`, errFile.message);
                    break;
                }
            }

            if (w) {
                w.onmessage = (e) => this.handleWorkerMessage(e);
                w.onerror = (err) => {
                    console.warn(`Ошибка в Web Worker #${i}:`, err);
                };
                createdWorkers.push(w);
            }
        }

        if (createdWorkers.length >= 2) {
            this.workers = createdWorkers;
            this.threadCount = createdWorkers.length;
            this.isMultiThreaded = true;

            for (let i = 0; i < this.workers.length; i++) {
                this.workers[i].postMessage({
                    type: 'INIT',
                    workerId: i,
                    totalWorkers: this.threadCount,
                    gridSize: this.gridSize,
                    worldSize: this.worldSize,
                    cellSize: this.cellSize,
                    grid: this.grid,
                    bCellSize: 6.0
                });
            }
            console.log(`🚀 Multi-Core Simulation Pool активирован: ${this.threadCount} потоков CPU (ядер)`);
        } else {
            for (let i = 0; i < createdWorkers.length; i++) {
                try { createdWorkers[i].terminate(); } catch (e) {}
            }
            this.workers = [];
            this.isMultiThreaded = false;
            console.log('⚡ Web Workers ограничены браузером (режим file:/// без HTTP-сервера). Используется высокопроизводительный SoA на главном потоке.');
        }
    }

    resize(grid, worldSize, cellSize) {
        this.grid = grid;
        this.worldSize = worldSize || this.worldSize;
        this.cellSize = cellSize || this.cellSize;
        this.gridSize = Math.round(this.worldSize / this.cellSize);

        const bCols = Math.ceil(this.worldSize / 6.0);
        const bRows = Math.ceil(this.worldSize / 6.0);
        this.syncHead = new Int32Array(bCols * bRows);

        // Шаг, отправленный до смены карты, считался по старой сетке — его результат не применяем
        this.clear();

        if (this.isMultiThreaded) {
            for (let i = 0; i < this.workers.length; i++) {
                this.workers[i].postMessage({
                    type: 'RESIZE',
                    gridSize: this.gridSize,
                    worldSize: this.worldSize,
                    cellSize: this.cellSize,
                    grid: this.grid
                });
            }
        }
    }

    packGlobalBuffer(allies, enemies) {
        this.activeUnits.length = 0;
        let offset = 0;

        const numAllies = allies.length;
        for (let i = 0; i < numAllies; i++) {
            const u = allies[i];
            if (u.hp <= 0) continue;
            this.activeUnits.push(u);

            const p = u.mesh.position;
            const vx = u.velocity ? u.velocity.x : 0;
            const vz = u.velocity ? u.velocity.z : 0;
            const pt = u.personalTarget;

            this.globalBuffer[offset++] = p.x;
            this.globalBuffer[offset++] = p.z;
            this.globalBuffer[offset++] = vx;
            this.globalBuffer[offset++] = vz;
            this.globalBuffer[offset++] = u.radius || 0.5;
            // 0 — законная скорость (танк в осаде): «|| 6.0» превращал её в 6
            this.globalBuffer[offset++] = (typeof u.speed === 'number') ? u.speed : 6.0;
            this.globalBuffer[offset++] = u.hp;
            this.globalBuffer[offset++] = u.attackCooldown || 1.0;
            this.globalBuffer[offset++] = 0; // ally
            this.globalBuffer[offset++] = (u.type === 'scout') ? 1 : ((u.type === 'tank') ? 2 : 0);
            this.globalBuffer[offset++] = simStateToCode(u.state);
            this.globalBuffer[offset++] = pt ? pt.x : 0;
            this.globalBuffer[offset++] = pt ? pt.z : 0;
            this.globalBuffer[offset++] = u.attackRange || 8.0;
            this.globalBuffer[offset++] = u.damage || 15.0;
            this.globalBuffer[offset++] = (typeof u.lastAttackTime === 'number') ? u.lastAttackTime : -99.0;
        }

        const numEnemies = enemies.length;
        for (let i = 0; i < numEnemies; i++) {
            const e = enemies[i];
            if (e.hp <= 0) continue;
            this.activeUnits.push(e);

            const p = e.mesh.position;
            const vx = e.velocity ? e.velocity.x : 0;
            const vz = e.velocity ? e.velocity.z : 0;
            const pt = e.personalTarget;

            this.globalBuffer[offset++] = p.x;
            this.globalBuffer[offset++] = p.z;
            this.globalBuffer[offset++] = vx;
            this.globalBuffer[offset++] = vz;
            this.globalBuffer[offset++] = e.radius || 0.5;
            this.globalBuffer[offset++] = (typeof e.speed === 'number') ? e.speed : 4.5;
            this.globalBuffer[offset++] = e.hp;
            this.globalBuffer[offset++] = e.attackCooldown || 1.0;
            this.globalBuffer[offset++] = 1; // enemy
            this.globalBuffer[offset++] = (e.type === 'scout') ? 1 : ((e.type === 'tank') ? 2 : ((e.type === 'boss') ? 3 : 0));
            this.globalBuffer[offset++] = simStateToCode(e.state);
            this.globalBuffer[offset++] = pt ? pt.x : 0;
            this.globalBuffer[offset++] = pt ? pt.z : 0;
            this.globalBuffer[offset++] = e.attackRange || 8.0;
            this.globalBuffer[offset++] = e.damage || 12.0;
            this.globalBuffer[offset++] = (typeof e.lastAttackTime === 'number') ? e.lastAttackTime : -99.0;
        }

        return this.activeUnits.length;
    }

    dispatchParallel(allies, enemies, delta, currentTime, hqData) {
        if (this.isBusy || !this.isMultiThreaded) return false;

        const totalUnits = this.packGlobalBuffer(allies, enemies);
        if (totalUnits === 0) return true;

        this.isBusy = true;
        this.stepEpoch++;
        this.stepStartTime = performance.now();
        this.pendingSlices = this.threadCount;
        this.sliceResults.length = 0;
        this.damageEventsQueue.length = 0;
        this.laserEventsQueue.length = 0;
        this.currentDelta = delta;

        const collisionMode = (typeof spatialGrid !== 'undefined' && spatialGrid.collisionMode === 'naive') ? 'naive' : 'spatial';

        // Копия подмассива активных данных для передачи воркерам (Zero-Allocation по размеру среза)
        const activeBytes = totalUnits * 16 * 4;
        const sendBuffer = this.globalBuffer.buffer.slice(0, activeBytes);

        const sliceSize = Math.ceil(totalUnits / this.threadCount);
        for (let i = 0; i < this.threadCount; i++) {
            const start = i * sliceSize;
            const count = Math.max(0, Math.min(sliceSize, totalUnits - start));

            if (count > 0) {
                this.workers[i].postMessage({
                    type: 'STEP_SLICE',
                    epoch: this.stepEpoch,
                    globalBuffer: sendBuffer,
                    totalUnits: totalUnits,
                    sliceStart: start,
                    sliceCount: count,
                    delta: delta,
                    currentTime: currentTime,
                    hqData: hqData,
                    collisionMode: collisionMode
                });
            } else {
                this.pendingSlices--;
            }
        }

        return true;
    }

    handleWorkerMessage(e) {
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'STEP_SLICE_DONE') {
            // Ответ на шаг, который уже отменён (стресс-тест остановлен, рестарт, смена карты):
            // его индексы относятся к старому списку юнитов
            if (msg.epoch !== this.stepEpoch || !this.isBusy) return;
            this.sliceResults.push(msg);

            if (msg.damageEvents && msg.damageEvents.length > 0) {
                for (let d = 0; d < msg.damageEvents.length; d++) {
                    this.damageEventsQueue.push(msg.damageEvents[d]);
                }
            }

            if (msg.laserEvents && msg.laserEvents.length > 0) {
                for (let l = 0; l < msg.laserEvents.length; l++) {
                    this.laserEventsQueue.push(msg.laserEvents[l]);
                }
            }

            this.pendingSlices--;
            if (this.pendingSlices <= 0) {
                this.applyParallelResults();
            }
        }
    }

    applyParallelResults() {
        const delta = this.currentDelta || 0.033;

        for (let s = 0; s < this.sliceResults.length; s++) {
            const slice = this.sliceResults[s];
            const data = new Float32Array(slice.buffer);
            const start = slice.sliceStart;
            const count = slice.sliceCount;

            let inOff = 0;
            for (let j = 0; j < count; j++) {
                const uIdx = start + j;
                if (uIdx >= this.activeUnits.length) break;
                const u = this.activeUnits[uIdx];
                if (!u || u.hp <= 0) {
                    inOff += 16;
                    continue;
                }

                const px = data[inOff++];
                const pz = data[inOff++];
                const vx = data[inOff++];
                const vz = data[inOff++];
                inOff += 2; // radius, speed
                const hp = data[inOff++];
                inOff += 3; // attackCooldown, team, uType
                const state = data[inOff++];
                inOff += 4; // tx, tz, attRange, dmg
                const lastAtt = data[inOff++];

                u.mesh.position.x = px;
                u.mesh.position.z = pz;
                if (u.velocity) {
                    u.velocity.x = vx;
                    u.velocity.z = vz;
                    if ((vx !== 0 || vz !== 0) && typeof THREE !== 'undefined') {
                        u.mesh.rotation.y = THREE.MathUtils.lerpAngle(u.mesh.rotation.y, Math.atan2(-vz, vx), 10 * delta);
                    }
                }
                u.state = simCodeToState(state);
                u.lastAttackTime = lastAtt;
            }
        }

        // Применение событий урона
        this.applyDamageEvents();

        // Спавн визуальных эффектов выстрелов
        this.spawnLaserEvents();

        this.lastStepDuration = performance.now() - this.stepStartTime;
        this.isBusy = false;
        this.stepCount++;
    }

    applyDamageEvents() {
        for (let i = 0; i < this.damageEventsQueue.length; i += 3) {
            const targetIdx = this.damageEventsQueue[i];
            const dmg = this.damageEventsQueue[i + 1];
            const team = this.damageEventsQueue[i + 2];

            if (targetIdx >= 0 && targetIdx < this.activeUnits.length) {
                const target = this.activeUnits[targetIdx];
                if (target && target.hp > 0) {
                    if (target.shield && target.shield > 0) {
                        target.shield -= dmg;
                        if (target.shield < 0) {
                            target.hp += target.shield;
                            target.shield = 0;
                        }
                    } else {
                        target.hp -= dmg;
                    }
                }
            } else if (targetIdx === -99) {
                if (team === 0 && typeof enemyHQ !== 'undefined' && enemyHQ && enemyHQ.hp > 0) {
                    enemyHQ.hp = Math.max(0, enemyHQ.hp - dmg);
                } else if (team === 1 && typeof playerHQ !== 'undefined' && playerHQ && playerHQ.hp > 0) {
                    playerHQ.hp = Math.max(0, playerHQ.hp - dmg);
                }
            }
        }
    }

    spawnLaserEvents() {
        if (typeof fireLaser !== 'function') return;
        const total = Math.floor(this.laserEventsQueue.length / 6);
        const maxLasers = Math.min(total, 25); // Ограничение на кадр для стабильных 60 FPS

        for (let i = 0; i < maxLasers; i++) {
            const base = i * 6;
            const fx = this.laserEventsQueue[base];
            const fz = this.laserEventsQueue[base + 1];
            const tx = this.laserEventsQueue[base + 2];
            const tz = this.laserEventsQueue[base + 3];
            const isAlly = (this.laserEventsQueue[base + 4] === 0);
            const uType = this.laserEventsQueue[base + 5];

            _simV1.set(fx, 0.75, fz);
            _simV2.set(tx, 0.75, tz);
            const lType = (uType === 2) ? 'heavy' : (uType === 3 ? 'boss' : (isAlly ? 'ally' : 'enemy'));
            fireLaser(_simV1, _simV2, isAlly, lType);
        }
    }

    // Синхронный режим на главном потоке (сверхбыстрый Linked-List SoA без аллокаций)
    stepSync(allies, enemies, delta, currentTime, grid, worldSize = 256, cellSize = 4, hqData = null) {
        const totalUnits = this.packGlobalBuffer(allies, enemies);
        if (totalUnits === 0) return;

        const t0 = performance.now();
        const halfWorld = worldSize * 0.5;
        const maxBound = halfWorld - (cellSize * 1.05);
        const bCellSize = 6.0;
        const bCols = Math.ceil(worldSize / bCellSize);
        const bRows = Math.ceil(worldSize / bCellSize);
        const collisionMode = (typeof spatialGrid !== 'undefined' && spatialGrid.collisionMode === 'naive') ? 'naive' : 'spatial';

        if (!this.syncHead || this.syncHead.length < bCols * bRows) {
            this.syncHead = new Int32Array(bCols * bRows);
        }
        if (this.syncNext.length < totalUnits) {
            this.syncNext = new Int32Array(Math.max(15000, totalUnits * 2));
        }

        this.syncHead.fill(-1);

        for (let i = 0; i < totalUnits; i++) {
            const off = i * 16;
            const ux = this.globalBuffer[off];
            const uz = this.globalBuffer[off + 1];
            const bc = ((ux + halfWorld) / bCellSize) | 0;
            const br = ((uz + halfWorld) / bCellSize) | 0;

            if (bc >= 0 && bc < bCols && br >= 0 && br < bRows) {
                const bIdx = br * bCols + bc;
                this.syncNext[i] = this.syncHead[bIdx];
                this.syncHead[bIdx] = i;
            } else {
                this.syncNext[i] = -1;
            }
        }

        this.damageEventsQueue.length = 0;
        this.laserEventsQueue.length = 0;

        for (let i = 0; i < totalUnits; i++) {
            const u = this.activeUnits[i];
            if (!u || u.hp <= 0) continue;

            const uOff = i * 16;
            let x = this.globalBuffer[uOff];
            let z = this.globalBuffer[uOff + 1];
            let vx = this.globalBuffer[uOff + 2];
            let vz = this.globalBuffer[uOff + 3];
            const r = this.globalBuffer[uOff + 4];
            const speed = this.globalBuffer[uOff + 5];
            const team = this.globalBuffer[uOff + 8];
            const uType = this.globalBuffer[uOff + 9];
            let state = this.globalBuffer[uOff + 10];
            const tx = this.globalBuffer[uOff + 11];
            const tz = this.globalBuffer[uOff + 12];
            const attRange = this.globalBuffer[uOff + 13];
            const dmg = this.globalBuffer[uOff + 14];
            let lastAtt = this.globalBuffer[uOff + 15];

            const bc = Math.max(0, Math.min(bCols - 1, ((x + halfWorld) / bCellSize) | 0));
            const br = Math.max(0, Math.min(bRows - 1, ((z + halfWorld) / bCellSize) | 0));

            let nearestEnemyIdx = -1;
            let nearestDistSq = attRange * attRange * 4.0;
            let targetX = 0;
            let targetZ = 0;

            if (collisionMode === 'naive') {
                const maxTest = Math.min(totalUnits, 500);
                for (let j = 0; j < maxTest; j++) {
                    if (j === i) continue;
                    const cOff = j * 16;
                    const candTeam = this.globalBuffer[cOff + 8];
                    const candHp = this.activeUnits[j] ? this.activeUnits[j].hp : 0;

                    if (candTeam !== team && candHp > 0) {
                        const ex = this.globalBuffer[cOff];
                        const ez = this.globalBuffer[cOff + 1];
                        const dX = ex - x;
                        const dZ = ez - z;
                        const dSq = dX * dX + dZ * dZ;

                        if (dSq < nearestDistSq) {
                            nearestDistSq = dSq;
                            nearestEnemyIdx = j;
                            targetX = ex;
                            targetZ = ez;
                        }
                    }
                }
            } else {
                for (let dr = -1; dr <= 1; dr++) {
                    const nbr = br + dr;
                    if (nbr < 0 || nbr >= bRows) continue;
                    const rowOff = nbr * bCols;

                    for (let dc = -1; dc <= 1; dc++) {
                        const nbc = bc + dc;
                        if (nbc < 0 || nbc >= bCols) continue;

                        let candIdx = this.syncHead[rowOff + nbc];
                        while (candIdx !== -1) {
                            const cOff = candIdx * 16;
                            const candTeam = this.globalBuffer[cOff + 8];
                            const candHp = this.activeUnits[candIdx] ? this.activeUnits[candIdx].hp : 0;

                            if (candTeam !== team && candHp > 0) {
                                const ex = this.globalBuffer[cOff];
                                const ez = this.globalBuffer[cOff + 1];
                                const dX = ex - x;
                                const dZ = ez - z;
                                const dSq = dX * dX + dZ * dZ;

                                if (dSq < nearestDistSq) {
                                    nearestDistSq = dSq;
                                    nearestEnemyIdx = candIdx;
                                    targetX = ex;
                                    targetZ = ez;
                                }
                            }
                            candIdx = this.syncNext[candIdx];
                        }
                    }
                }
            }

            if (hqData) {
                const targetHQX = (team === 0) ? hqData.enemyX : hqData.playerX;
                const targetHQZ = (team === 0) ? hqData.enemyZ : hqData.playerZ;
                const targetHQHp = (team === 0) ? hqData.enemyHp : hqData.playerHp;
                if (targetHQHp > 0) {
                    const dX = targetHQX - x;
                    const dZ = targetHQZ - z;
                    const dSq = dX * dX + dZ * dZ;
                    if (dSq < nearestDistSq) {
                        nearestDistSq = dSq;
                        nearestEnemyIdx = -99;
                        targetX = targetHQX;
                        targetZ = targetHQZ;
                    }
                }
            }

            if (nearestEnemyIdx !== -1) {
                const dist = Math.sqrt(nearestDistSq);
                if (dist <= attRange) {
                    state = 3; // ATTACK
                    vx = 0; vz = 0;

                    const cooldown = u.attackCooldown || 1.0;
                    if (currentTime - lastAtt >= cooldown) {
                        lastAtt = currentTime;
                        if (nearestEnemyIdx >= 0) {
                            this.damageEventsQueue.push(nearestEnemyIdx, dmg, team);
                        } else if (nearestEnemyIdx === -99) {
                            this.damageEventsQueue.push(-99, dmg, team);
                        }
                        this.laserEventsQueue.push(x, z, targetX, targetZ, team, uType);
                    }
                } else {
                    state = 2; // CHASE
                    const dx = (targetX - x) / dist;
                    const dz = (targetZ - z) / dist;
                    vx = dx * speed;
                    vz = dz * speed;
                }
            } else if (tx !== 0 || tz !== 0) {
                state = 1; // MOVE
                let dirX = 0, dirZ = 0;

                const flowX = (team === 0) ? this.allyFlowX : this.enemyFlowX;
                const flowY = (team === 0) ? this.allyFlowY : this.enemyFlowY;
                if (flowX && flowY && cellSize > 0) {
                    const gc = Math.floor((x + halfWorld) / cellSize);
                    const gr = Math.floor((z + halfWorld) / cellSize);
                    if (gc >= 0 && gc < this.gridSize && gr >= 0 && gr < this.gridSize) {
                        const cIdx = gr * this.gridSize + gc;
                        dirX = flowX[cIdx] || 0;
                        dirZ = flowY[cIdx] || 0;
                    }
                }

                if (dirX === 0 && dirZ === 0) {
                    const dx = tx - x;
                    const dz = tz - z;
                    const d = Math.hypot(dx, dz);
                    if (d > 0.4) {
                        dirX = dx / d;
                        dirZ = dz / d;
                    }
                }

                if (dirX !== 0 || dirZ !== 0) {
                    vx = dirX * speed;
                    vz = dirZ * speed;
                } else {
                    state = 0; // IDLE
                    vx = 0; vz = 0;
                }
            } else {
                state = 0; // IDLE
                vx = 0; vz = 0;
            }

            let sepX = 0, sepZ = 0;
            if (collisionMode === 'naive') {
                const maxSep = Math.min(totalUnits, 300);
                for (let j = 0; j < maxSep; j++) {
                    if (j !== i) {
                        const oOff = j * 16;
                        const ox = this.globalBuffer[oOff];
                        const oz = this.globalBuffer[oOff + 1];
                        const oRad = this.globalBuffer[oOff + 4];
                        const minD = r + oRad;

                        const diffX = x - ox;
                        const diffZ = z - oz;
                        const dSq = diffX * diffX + diffZ * diffZ;

                        if (dSq < minD * minD && dSq > 0.000001) {
                            const d = Math.sqrt(dSq);
                            const push = (minD - d) * 0.5;
                            sepX += (diffX / d) * push;
                            sepZ += (diffZ / d) * push;
                        }
                    }
                }
            } else {
                for (let dr = -1; dr <= 1; dr++) {
                    const nbr = br + dr;
                    if (nbr < 0 || nbr >= bRows) continue;
                    const rowOff = nbr * bCols;

                    for (let dc = -1; dc <= 1; dc++) {
                        const nbc = bc + dc;
                        if (nbc < 0 || nbc >= bCols) continue;

                        let otherIdx = this.syncHead[rowOff + nbc];
                        while (otherIdx !== -1) {
                            if (otherIdx !== i) {
                                const oOff = otherIdx * 16;
                                const ox = this.globalBuffer[oOff];
                                const oz = this.globalBuffer[oOff + 1];
                                const oRad = this.globalBuffer[oOff + 4];
                                const minD = r + oRad;

                                const diffX = x - ox;
                                const diffZ = z - oz;
                                const dSq = diffX * diffX + diffZ * diffZ;

                                if (dSq < minD * minD && dSq > 0.000001) {
                                    const d = Math.sqrt(dSq);
                                    const push = (minD - d) * 0.5;
                                    sepX += (diffX / d) * push;
                                    sepZ += (diffZ / d) * push;
                                }
                            }
                            otherIdx = this.syncNext[otherIdx];
                        }
                    }
                }
            }

            x += (vx * delta) + sepX;
            z += (vz * delta) + sepZ;

            if (x < -maxBound) x = -maxBound;
            else if (x > maxBound) x = maxBound;
            if (z < -maxBound) z = -maxBound;
            else if (z > maxBound) z = maxBound;

            if (grid && cellSize > 0) {
                const gc = Math.floor((x + halfWorld) / cellSize);
                const gr = Math.floor((z + halfWorld) / cellSize);
                if (gc >= 0 && gc < grid.length && gr >= 0 && gr < grid.length && grid[gr] && grid[gr][gc] === 1) {
                    const cellCenterX = (gc + 0.5) * cellSize - halfWorld;
                    const cellCenterZ = (gr + 0.5) * cellSize - halfWorld;
                    const pushDirX = x - cellCenterX;
                    const pushDirZ = z - cellCenterZ;
                    const pLen = Math.hypot(pushDirX, pushDirZ) || 0.001;
                    const pushX = pushDirX / pLen;
                    const pushZ = pushDirZ / pLen;
                    x = cellCenterX + pushX * (cellSize * 0.72);
                    z = cellCenterZ + pushZ * (cellSize * 0.72);

                    const dot = vx * (-pushX) + vz * (-pushZ);
                    if (dot > 0) {
                        vx += pushX * dot;
                        vz += pushZ * dot;
                    }
                }
            }

            u.mesh.position.x = x;
            u.mesh.position.z = z;
            if (u.velocity) {
                u.velocity.x = vx;
                u.velocity.z = vz;
                if ((vx !== 0 || vz !== 0) && typeof THREE !== 'undefined') {
                    u.mesh.rotation.y = THREE.MathUtils.lerpAngle(u.mesh.rotation.y, Math.atan2(-vz, vx), 10 * delta);
                }
            }
            u.state = simCodeToState(state);
            u.lastAttackTime = lastAtt;
        }

        this.applyDamageEvents();
        this.spawnLaserEvents();
        this.lastStepDuration = performance.now() - t0;
    }
}

// Глобальные экземпляры мира и менеджера пула потоков
const simWorld = new SimulationWorld();
const simWorkerPool = new SimulationWorkerPool();
const simWorkerManager = simWorkerPool;
