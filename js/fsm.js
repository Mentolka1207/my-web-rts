// =============================================================================
// js/fsm.js — Чистый конечный автомат (FSM) юнитов без зависимостей от рендера и DOM
// =============================================================================

const FSM_STATES = (typeof States !== 'undefined')
    ? States
    : { IDLE: 'IDLE', MOVE: 'MOVE', CHASE: 'CHASE', ATTACK: 'ATTACK' };

const _fsmBypassVec = {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    },
    normalize() {
        const len = Math.hypot(this.x, this.y, this.z);
        if (len > 0) {
            this.x /= len;
            this.y /= len;
            this.z /= len;
        }
        return this;
    }
};

function fsmGetPos(entity) {
    if (!entity) return null;
    if (entity.mesh && entity.mesh.position) return entity.mesh.position;
    if (entity.pos) return entity.pos;
    return entity;
}

function fsmDist3D(a, b) {
    return Math.hypot(b.x - a.x, (b.y || 0) - (a.y || 0), b.z - a.z);
}

function fsmLerpAngle(start, end, t) {
    const twoPi = Math.PI * 2;
    let diff = (end - start) % twoPi;
    if (diff > Math.PI) diff -= twoPi;
    if (diff < -Math.PI) diff += twoPi;
    const clampedT = t < 0 ? 0 : (t > 1 ? 1 : t);
    return start + diff * clampedT;
}

function fsmSetVelocity(unit, vx, vz) {
    if (!unit.velocity) {
        unit.velocity = { x: 0, y: 0, z: 0 };
    }
    unit.velocity.x = vx;
    unit.velocity.y = 0;
    unit.velocity.z = vz;
    if (unit.mesh && unit.mesh.userData && unit.mesh.userData.velocity) {
        const uv = unit.mesh.userData.velocity;
        uv.x = vx;
        uv.y = 0;
        uv.z = vz;
    }
}

function fsmRotateTowards(unit, dx, dz, delta) {
    const targetAngle = Math.atan2(-dz, dx);
    const stepT = 10 * delta;
    if (unit.mesh && unit.mesh.rotation) {
        unit.mesh.rotation.y = fsmLerpAngle(unit.mesh.rotation.y || 0, targetAngle, stepT);
        unit.rotationY = unit.mesh.rotation.y;
    } else {
        unit.rotationY = fsmLerpAngle(unit.rotationY || 0, targetAngle, stepT);
    }
}

function fsmWorldToGrid(x, z, gridSize, cellSize, halfWorld) {
    return {
        col: Math.floor((x + halfWorld) / cellSize),
        row: Math.floor((z + halfWorld) / cellSize)
    };
}

function fsmGridToWorld(col, row, cellSize, halfWorld) {
    const halfCell = cellSize * 0.5;
    return {
        x: col * cellSize - halfWorld + halfCell,
        z: row * cellSize - halfWorld + halfCell
    };
}

function fsmHasLineOfSight(x0, z0, x1, z1, grid, cellSize, halfWorld) {
    if (!grid || !grid.length) return true;
    const gridSize = grid.length;
    const start = fsmWorldToGrid(x0, z0, gridSize, cellSize, halfWorld);
    const end = fsmWorldToGrid(x1, z1, gridSize, cellSize, halfWorld);
    let c0 = start.col;
    let r0 = start.row;
    const c1 = end.col;
    const r1 = end.row;

    const dc = Math.abs(c1 - c0);
    const dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc - dr;

    while (true) {
        if (c0 >= 0 && c0 < gridSize && r0 >= 0 && r0 < gridSize) {
            if ((c0 !== start.col || r0 !== start.row) && (c0 !== c1 || r0 !== r1)) {
                if (grid[r0][c0] === 1) return false;
            }
        }
        if (c0 === c1 && r0 === r1) break;
        const e2 = 2 * err;
        if (e2 > -dr) {
            err -= dr;
            c0 += sc;
        }
        if (e2 < dc) {
            err += dc;
            r0 += sr;
        }
    }
    return true;
}

function fsmFindBypassDirection(fromX, fromZ, targetX, targetZ, grid, cellSize, halfWorld, outVec) {
    const out = outVec || _fsmBypassVec;
    if (!grid || !grid.length) {
        const dx = targetX - fromX;
        const dz = targetZ - fromZ;
        const len = Math.hypot(dx, dz) || 1;
        out.x = dx / len;
        out.y = 0;
        out.z = dz / len;
        return out;
    }

    const gridSize = grid.length;
    const g = fsmWorldToGrid(fromX, fromZ, gridSize, cellSize, halfWorld);
    let bestDistSq = Infinity;
    let bestX = targetX;
    let bestZ = targetZ;
    let found = false;

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dc === 0 && dr === 0) continue;
            const nr = g.row + dr;
            const nc = g.col + dc;
            if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && grid[nr][nc] === 0) {
                const w = fsmGridToWorld(nc, nr, cellSize, halfWorld);
                const dSq = (w.x - targetX) * (w.x - targetX) + (w.z - targetZ) * (w.z - targetZ);
                if (dSq < bestDistSq) {
                    bestDistSq = dSq;
                    bestX = w.x;
                    bestZ = w.z;
                    found = true;
                }
            }
        }
    }

    const dx = (found ? bestX : targetX) - fromX;
    const dz = (found ? bestZ : targetZ) - fromZ;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
        out.x = dx / len;
        out.y = 0;
        out.z = dz / len;
    } else {
        out.x = 1;
        out.y = 0;
        out.z = 0;
    }
    return out;
}

function createFSMEvents() {
    return {
        damage: [],
        laser: [],
        explosion: [],
        hitFlash: []
    };
}

function clearFSMEvents(events) {
    if (!events) return;
    events.damage.length = 0;
    events.laser.length = 0;
    events.explosion.length = 0;
    events.hitFlash.length = 0;
}

function fsmReadFlowSample(field, col, row, gridSize) {
    if (!field) return { fx: 0, fy: 0, dist: 65535 };
    if (field.flowX && field.flowY && field.width === gridSize && field.flowX.length === gridSize * gridSize) {
        const idx = row * gridSize + col;
        return {
            fx: field.flowX[idx] || 0,
            fy: field.flowY[idx] || 0,
            dist: field.integration ? field.integration[idx] : 65535
        };
    }
    if (field.flowField && field.flowField[row] && field.flowField[row][col]) {
        const vec = field.flowField[row][col];
        return {
            fx: vec.x || 0,
            fy: vec.y || 0,
            dist: (field.integrationField && field.integrationField[row]) ? field.integrationField[row][col] : 65535
        };
    }
    return { fx: 0, fy: 0, dist: 65535 };
}

/**
 * Выполняет один дискретный шаг конечного автомата союзного юнита.
 * Побочные эффекты (урон, лазеры, взрывы, вспышки) записываются в ctx.events.
 *
 * @param {object} unit
 * @param {number} delta
 * @param {object} ctx
 */
function stepUnitFSM(unit, delta, ctx) {
    if (!unit || unit.hp <= 0 || !ctx) return;

    const pos = fsmGetPos(unit);
    if (!pos) return;

    const grid = ctx.grid;
    const gridSize = ctx.gridSize || (grid ? grid.length : 0);
    const cellSize = ctx.cellSize || 4;
    const halfWorld = ctx.halfWorld !== undefined ? ctx.halfWorld : (gridSize * cellSize * 0.5);
    const events = ctx.events || (ctx.events = createFSMEvents());
    const gameTime = ctx.gameTime || 0;

    const checkLOS = (x0, z0, x1, z1) => (
        ctx.hasLineOfSight
            ? ctx.hasLineOfSight(x0, z0, x1, z1)
            : fsmHasLineOfSight(x0, z0, x1, z1, grid, cellSize, halfWorld)
    );
    const getBypass = (x0, z0, x1, z1) => {
        if (ctx.findBypassDirection) {
            ctx.findBypassDirection(x0, z0, x1, z1, _fsmBypassVec);
        } else {
            fsmFindBypassDirection(x0, z0, x1, z1, grid, cellSize, halfWorld, _fsmBypassVec);
        }
        return _fsmBypassVec;
    };

    // 1. Поиск ближайшего врага в обзоре и сравнение со штабом противника
    const query = ctx.findNearest
        ? ctx.findNearest(pos, unit.visionRange, 'enemy')
        : { unit: null, dist: Infinity };
    let nearestEnemy = query ? query.unit : null;
    let minDist = (query && typeof query.dist === 'number') ? query.dist : Infinity;

    const enemyHQ = ctx.enemyHQ;
    if (enemyHQ && enemyHQ.hp > 0) {
        const hqPos = fsmGetPos(enemyHQ);
        if (hqPos) {
            const dHQ = fsmDist3D(pos, hqPos);
            if (dHQ < minDist) {
                minDist = dHQ;
                nearestEnemy = enemyHQ;
            }
        }
    }

    // 2. Приказ фокус-атаки: пока цель жива, она приоритетнее ближайшего врага
    if (unit.orderTarget) {
        if (unit.orderTarget.hp <= 0) {
            unit.orderTarget = null;
        } else {
            const orderPos = fsmGetPos(unit.orderTarget);
            if (orderPos && unit.targetEnemy !== unit.orderTarget &&
                fsmDist3D(pos, orderPos) <= unit.visionRange) {
                unit.targetEnemy = unit.orderTarget;
                if (unit.state !== FSM_STATES.ATTACK) {
                    unit.state = FSM_STATES.CHASE;
                }
            }
        }
    }

    // 3. Переходы и действия FSM
    switch (unit.state) {
        case FSM_STATES.IDLE:
            fsmSetVelocity(unit, 0, 0);
            if (nearestEnemy) {
                unit.targetEnemy = nearestEnemy;
                unit.state = FSM_STATES.CHASE;
            }
            break;

        case FSM_STATES.MOVE:
            if (nearestEnemy) {
                unit.targetEnemy = nearestEnemy;
                unit.state = FSM_STATES.CHASE;
                break;
            }

            if (unit.personalTarget) {
                const distToTarget = fsmDist3D(pos, unit.personalTarget);
                const stopThreshold = Math.max(0.4, (unit.radius || 0.45) * 0.9);
                if (distToTarget <= stopThreshold) {
                    unit.state = FSM_STATES.IDLE;
                    unit.personalTarget = null;
                    unit.finalApproach = false;
                    fsmSetVelocity(unit, 0, 0);
                    break;
                }

                const gridPos = fsmWorldToGrid(pos.x, pos.z, gridSize, cellSize, halfWorld);
                if (gridPos.col >= 0 && gridPos.col < gridSize && gridPos.row >= 0 && gridPos.row < gridSize) {
                    // Поле потока своего приказа (снимок) изолирует группу от следующих приказов другим отрядам
                    const ownField = (unit.flowField && unit.flowField.width === gridSize &&
                        unit.flowField.flowX && unit.flowField.flowX.length === gridSize * gridSize)
                        ? unit.flowField
                        : ctx.flowField;
                    const sample = fsmReadFlowSample(ownField, gridPos.col, gridPos.row, gridSize);
                    const flowX = sample.fx;
                    const flowY = sample.fy;
                    const cellsToGoal = sample.dist;

                    const dxGoal = unit.personalTarget.x - pos.x;
                    const dzGoal = unit.personalTarget.z - pos.z;
                    const distance = Math.hypot(dxGoal, dzGoal);
                    const dirX = distance > 0.001 ? dxGoal / distance : 1;
                    const dirZ = distance > 0.001 ? dzGoal / distance : 0;

                    const hasLOS = checkLOS(pos.x, pos.z, unit.personalTarget.x, unit.personalTarget.z);
                    if (!unit.finalApproach && ((distance < 3.5 && hasLOS) || cellsToGoal <= 1 || (flowX === 0 && flowY === 0))) {
                        unit.finalApproach = true;
                        unit.approachTime = 0;
                        unit.approachLimit = 3 + (distance / Math.max(unit.speed, 0.5)) * 2;
                    }

                    let moveX = 0;
                    let moveZ = 0;

                    if (unit.finalApproach) {
                        unit.approachTime = (unit.approachTime || 0) + delta;
                        if (unit.speed > 0 && unit.approachTime > unit.approachLimit) {
                            unit.state = FSM_STATES.IDLE;
                            unit.personalTarget = null;
                            unit.finalApproach = false;
                            fsmSetVelocity(unit, 0, 0);
                            break;
                        }
                        if (hasLOS) {
                            moveX = dirX;
                            moveZ = dirZ;
                        } else {
                            const bVec = getBypass(pos.x, pos.z, unit.personalTarget.x, unit.personalTarget.z);
                            moveX = bVec.x;
                            moveZ = bVec.z;
                        }
                    } else if (hasLOS) {
                        // Подтягивание к личному месту в строю только при прямой видимости (без стены на пути)
                        const bx = flowX * 0.75 + dirX * 0.25;
                        const bz = flowY * 0.75 + dirZ * 0.25;
                        const bLen = Math.hypot(bx, bz);
                        if (bLen > 0) {
                            moveX = bx / bLen;
                            moveZ = bz / bLen;
                        }
                    } else {
                        moveX = flowX;
                        moveZ = flowY;
                    }

                    let currentSpeed = unit.speed;
                    if (distance < 1.6) {
                        currentSpeed *= Math.max(0.25, distance / 1.6);
                    }

                    const step = Math.min(currentSpeed * delta, distance);
                    pos.x += moveX * step;
                    pos.z += moveZ * step;
                    fsmSetVelocity(unit, moveX * currentSpeed, moveZ * currentSpeed);
                    fsmRotateTowards(unit, moveX, moveZ, delta);
                }
            }
            break;

        case FSM_STATES.CHASE: {
            if (!unit.targetEnemy || unit.targetEnemy.hp <= 0) {
                if (unit.orderTarget === unit.targetEnemy) unit.orderTarget = null;
                unit.targetEnemy = null;
                unit.state = unit.personalTarget ? FSM_STATES.MOVE : FSM_STATES.IDLE;
                fsmSetVelocity(unit, 0, 0);
                break;
            }

            const enemyPos = fsmGetPos(unit.targetEnemy);
            const distToEnemy = fsmDist3D(pos, enemyPos);
            const isOrderedTarget = (unit.orderTarget === unit.targetEnemy);

            if (distToEnemy <= unit.attackRange) {
                unit.state = FSM_STATES.ATTACK;
                fsmSetVelocity(unit, 0, 0);
            } else if (!isOrderedTarget && distToEnemy > unit.visionRange) {
                unit.targetEnemy = null;
                unit.state = unit.personalTarget ? FSM_STATES.MOVE : FSM_STATES.IDLE;
                fsmSetVelocity(unit, 0, 0);
            } else {
                const los = checkLOS(pos.x, pos.z, enemyPos.x, enemyPos.z);
                let moveX = 0;
                let moveZ = 0;

                if (los) {
                    const dx = enemyPos.x - pos.x;
                    const dz = enemyPos.z - pos.z;
                    const len = Math.hypot(dx, dz);
                    if (len > 0) {
                        moveX = dx / len;
                        moveZ = dz / len;
                    }
                } else {
                    let followsField = false;
                    const chaseField = isOrderedTarget ? unit.flowField : null;
                    if (chaseField && chaseField.width === gridSize &&
                        chaseField.flowX && chaseField.flowX.length === gridSize * gridSize) {
                        const cg = fsmWorldToGrid(pos.x, pos.z, gridSize, cellSize, halfWorld);
                        if (cg.col >= 0 && cg.col < gridSize && cg.row >= 0 && cg.row < gridSize) {
                            const ci = cg.row * gridSize + cg.col;
                            if (chaseField.flowX[ci] !== 0 || chaseField.flowY[ci] !== 0) {
                                moveX = chaseField.flowX[ci];
                                moveZ = chaseField.flowY[ci];
                                followsField = true;
                            }
                        }
                    }
                    if (!followsField) {
                        const bVec = getBypass(pos.x, pos.z, enemyPos.x, enemyPos.z);
                        moveX = bVec.x;
                        moveZ = bVec.z;
                    }
                }

                pos.x += moveX * unit.speed * delta;
                pos.z += moveZ * unit.speed * delta;
                fsmSetVelocity(unit, moveX * unit.speed, moveZ * unit.speed);
                fsmRotateTowards(unit, moveX, moveZ, delta);
            }
            break;
        }

        case FSM_STATES.ATTACK: {
            fsmSetVelocity(unit, 0, 0);
            if (!unit.targetEnemy || unit.targetEnemy.hp <= 0) {
                if (unit.orderTarget === unit.targetEnemy) unit.orderTarget = null;
                unit.targetEnemy = null;
                unit.state = unit.personalTarget ? FSM_STATES.MOVE : FSM_STATES.IDLE;
                break;
            }

            const attEnemyPos = fsmGetPos(unit.targetEnemy);
            const distToAttEnemy = fsmDist3D(pos, attEnemyPos);

            if (distToAttEnemy > unit.attackRange) {
                unit.state = FSM_STATES.CHASE;
            } else {
                const dx = attEnemyPos.x - pos.x;
                const dz = attEnemyPos.z - pos.z;
                const len = Math.hypot(dx, dz);
                if (len > 0) {
                    fsmRotateTowards(unit, dx / len, dz / len, delta);
                }

                if (gameTime - unit.lastAttackTime >= unit.attackCooldown) {
                    unit.lastAttackTime = gameTime;

                    const posY = pos.y !== undefined ? pos.y : 0.75;
                    const tgtY = attEnemyPos.y !== undefined ? attEnemyPos.y : 0.75;

                    events.damage.push({
                        target: unit.targetEnemy,
                        amount: unit.damage,
                        attacker: unit,
                        isSplash: false
                    });
                    events.laser.push({
                        from: { x: pos.x, y: posY, z: pos.z },
                        to: { x: attEnemyPos.x, y: tgtY, z: attEnemyPos.z },
                        isAlly: true,
                        soundType: unit.type === 'tank' ? 'heavy' : 'ally'
                    });

                    // Осадный сплэш-урон Танка по площади в радиусе 2.2
                    if (unit.isSieged) {
                        events.explosion.push({
                            position: { x: attEnemyPos.x, y: tgtY, z: attEnemyPos.z },
                            count: 8
                        });
                        const enemiesList = ctx.enemies || [];
                        for (let oIdx = 0; oIdx < enemiesList.length; oIdx++) {
                            const other = enemiesList[oIdx];
                            if (other !== unit.targetEnemy && other.hp > 0) {
                                const otherPos = fsmGetPos(other);
                                if (otherPos && fsmDist3D(otherPos, attEnemyPos) <= 2.2) {
                                    events.damage.push({
                                        target: other,
                                        amount: Math.floor(unit.damage * 0.5),
                                        attacker: unit,
                                        isSplash: true
                                    });
                                    events.hitFlash.push({
                                        position: {
                                            x: otherPos.x,
                                            y: otherPos.y !== undefined ? otherPos.y : 0.75,
                                            z: otherPos.z
                                        },
                                        isAlly: true
                                    });
                                }
                            }
                        }
                    }
                }
            }
            break;
        }
    }
}

/**
 * Возвращает патрульного врага, оставшегося в MOVE без цели патруля (после погони), обратно в IDLE.
 *
 * @param {object} enemy
 * @returns {boolean}
 */
function recoverIdleEnemyPatrol(enemy) {
    if (!enemy) return false;
    enemy.state = FSM_STATES.IDLE;
    fsmSetVelocity(enemy, 0, 0);
    if (!(enemy.roamCooldown > 0)) enemy.roamCooldown = 1.0;
    return true;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FSM_STATES,
        createFSMEvents,
        clearFSMEvents,
        stepUnitFSM,
        recoverIdleEnemyPatrol,
        fsmHasLineOfSight,
        fsmFindBypassDirection
    };
}
