// =============================================================================
// js/sim_worker.js — Фоновый поток симуляции (Web Worker Multi-Core Engine)
// Параллельный расчет пространственной сетки, FSM, поиска целей,
// расталкивания (Separation) и коллизий с препятствиями на выделенном ядре CPU.
// =============================================================================

let workerId = 0;
let totalWorkers = 1;
let workerGrid = null;
let gridSize = 64;
let worldSize = 256;
let cellSize = 4;
let halfWorld = 128;
let maxBound = 120;

// Пространственные корзины (Spatial Grid Linked-List) для поиска соседей за O(1)
let bCellSize = 6.0;
let bCols = 0;
let bRows = 0;
let bTotal = 0;
let bHead = null;
let bNext = null;

// Переиспользуемые буферы воркера (Zero-Allocation)
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
            bNext = new Int32Array(15000); // поддержка до 15 000 юнитов

            self.postMessage({ type: 'READY', workerId: workerId });
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

            // Выделение буфера под результат слайса
            const neededLen = sliceCount * 16;
            if (!sliceResultBuffer || sliceResultBuffer.length < neededLen) {
                sliceResultBuffer = new Float32Array(neededLen);
            }

            damageEvents.length = 0;
            laserEvents.length = 0;

            // 1. Построение пространственной сетки (Linked List O(N) без аллокаций)
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
                }
            }

            // 2. Параллельная обработка юнитов слайса на данном ядре CPU
            const sliceEnd = sliceStart + sliceCount;
            let outOffset = 0;

            for (let i = sliceStart; i < sliceEnd; i++) {
                const uOff = i * 16;
                let x = globalBuffer[uOff];
                let z = globalBuffer[uOff + 1];
                let vx = globalBuffer[uOff + 2];
                let vz = globalBuffer[uOff + 3];
                const r = globalBuffer[uOff + 4];
                const speed = globalBuffer[uOff + 5];
                let hp = globalBuffer[uOff + 6];
                const maxHp = globalBuffer[uOff + 7];
                const team = globalBuffer[uOff + 8]; // 0: ally, 1: enemy
                const uType = globalBuffer[uOff + 9]; // 0: standard, 1: scout, 2: tank, 3: boss
                let state = globalBuffer[uOff + 10];
                const tx = globalBuffer[uOff + 11];
                const tz = globalBuffer[uOff + 12];
                const attRange = globalBuffer[uOff + 13];
                const dmg = globalBuffer[uOff + 14];
                let lastAtt = globalBuffer[uOff + 15];

                if (hp > 0) {
                    // А. Поиск ближайшей цели противника в окрестных ячейках
                    const bc = Math.max(0, Math.min(bCols - 1, ((x + halfWorld) / bCellSize) | 0));
                    const br = Math.max(0, Math.min(bRows - 1, ((z + halfWorld) / bCellSize) | 0));

                    let nearestEnemyIdx = -1;
                    let nearestDistSq = attRange * attRange * 4.0;
                    let targetX = 0;
                    let targetZ = 0;

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

                    // Проверка вражеского штаба как цели
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

                    // Б. FSM логика (ATTACK / CHASE / MOVE / IDLE)
                    if (nearestEnemyIdx !== -1) {
                        const dist = Math.sqrt(nearestDistSq);
                        if (dist <= attRange) {
                            state = 3; // ATTACK
                            vx = 0; vz = 0;

                            const cooldown = (uType === 2) ? 1.6 : (uType === 1 ? 0.75 : 1.0);
                            if (currentTime - lastAtt >= cooldown) {
                                lastAtt = currentTime;
                                if (nearestEnemyIdx >= 0) {
                                    damageEvents.push(nearestEnemyIdx, dmg);
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
                        const dx = tx - x;
                        const dz = tz - z;
                        const d = Math.hypot(dx, dz);
                        if (d > 0.4) {
                            vx = (dx / d) * speed;
                            vz = (dz / d) * speed;
                        } else {
                            state = 0; // IDLE
                            vx = 0; vz = 0;
                        }
                    } else {
                        state = 0; // IDLE
                        vx = 0; vz = 0;
                    }

                    // В. Высокопроизводительное расталкивание (Separation)
                    let sepX = 0, sepZ = 0;
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

                    // Г. Интеграция шага позиции
                    x += (vx * delta) + sepX;
                    z += (vz * delta) + sepZ;

                    // Д. Ограничение границами арены
                    if (x < -maxBound) x = -maxBound;
                    else if (x > maxBound) x = maxBound;
                    if (z < -maxBound) z = -maxBound;
                    else if (z > maxBound) z = maxBound;

                    // Е. Коллизии со стенами карты
                    if (workerGrid && cellSize > 0) {
                        const gc = Math.floor((x + halfWorld) / cellSize);
                        const gr = Math.floor((z + halfWorld) / cellSize);
                        if (gc >= 0 && gc < gridSize && gr >= 0 && gr < gridSize && workerGrid[gr] && workerGrid[gr][gc] === 1) {
                            const cellCenterX = (gc + 0.5) * cellSize - halfWorld;
                            const cellCenterZ = (gr + 0.5) * cellSize - halfWorld;
                            const pushDirX = x - cellCenterX;
                            const pushDirZ = z - cellCenterZ;
                            const pLen = Math.hypot(pushDirX, pushDirZ) || 0.001;
                            x = cellCenterX + (pushDirX / pLen) * (cellSize * 0.72);
                            z = cellCenterZ + (pushDirZ / pLen) * (cellSize * 0.72);
                        }
                    }
                }

                // Запись обновленных данных в буфер ответа
                sliceResultBuffer[outOffset++] = x;
                sliceResultBuffer[outOffset++] = z;
                sliceResultBuffer[outOffset++] = vx;
                sliceResultBuffer[outOffset++] = vz;
                sliceResultBuffer[outOffset++] = r;
                sliceResultBuffer[outOffset++] = speed;
                sliceResultBuffer[outOffset++] = hp;
                sliceResultBuffer[outOffset++] = maxHp;
                sliceResultBuffer[outOffset++] = team;
                sliceResultBuffer[outOffset++] = uType;
                sliceResultBuffer[outOffset++] = state;
                sliceResultBuffer[outOffset++] = tx;
                sliceResultBuffer[outOffset++] = tz;
                sliceResultBuffer[outOffset++] = attRange;
                sliceResultBuffer[outOffset++] = dmg;
                sliceResultBuffer[outOffset++] = lastAtt;
            }

            // Передача результата главному потоку через Transferable ArrayBuffer
            self.postMessage(
                {
                    type: 'STEP_SLICE_DONE',
                    workerId: workerId,
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
