// =============================================================================
// main.js — Главный оркестратор и игровой цикл Tabhold
// Модульная архитектура:
// - js/config.js      — Константы, архетипы юнитов и дебаггер
// - js/grid.js        — Сетка карты и преобразование координат
// - js/formations.js  — Тактические построения (Шеренга, Клин)
// - js/flowfield.js   — Высокопроизводительный поиск пути Flow Field (BFS)
// - js/scene.js       — Three.js сцена, камера, освещение и рендер
// - js/terrain.js     — Процедурные текстуры, поверхность и препятствия
// - js/healthbar.js   — 3D полоски здоровья и щита
// - js/models.js      — 3D модели дронов, флагмана-Левиафана и штабов
// - js/particles.js   — Пул частиц (THREE.Points): искры попаданий и обломки взрывов
// - js/effects.js     — Пул лазеров, вспышек и следов попаданий
// - js/units.js       — Юниты, спавн, физика анимаций и проверка позиций
// - js/resources.js   — Кристаллы сбора ресурсов и логика захвата
// - js/economy.js     — Энергия, доходы и производство
// - js/ai.js          — ИИ врагов, составные волны и тактические контратаки
// - js/minimap.js     — Миникарта с кэшированием и масштабируемыми маркерами
// - js/input.js       — Управление: выбор, приказы, MMB панорама и сенсор
// - js/ui.js          — Меню, оповещения и экраны победы/поражения
// Инициализация GPU Instanced Rendering менеджера и Web Worker SoA
if (typeof instancedRenderer !== 'undefined') {
    instancedRenderer.init(scene);
}
if (typeof simWorkerManager !== 'undefined') {
    simWorkerManager.init(grid, MAP_WORLD_SIZE, CELL_SIZE);
}

// Создание начальных отрядов
initStartingUnits();

// Переиспользуемый плоский массив активных юнитов для коллизий (Zero-Allocation)
const _allActiveUnits = [];

// Таймер Three.js r186 (замена устаревшему THREE.Clock с сохранением обратной совместимости)
const rtsTimer = (typeof THREE !== 'undefined' && THREE.Timer) ? new THREE.Timer() : null;
const rtsClock = rtsTimer ? null : (typeof THREE !== 'undefined' && THREE.Clock ? new THREE.Clock() : null);

const clock = {
    get elapsedTime() {
        return rtsTimer ? rtsTimer.getElapsed() : (rtsClock ? rtsClock.elapsedTime : (performance.now() / 1000));
    },
    getDelta() {
        return rtsTimer ? rtsTimer.getDelta() : (rtsClock ? rtsClock.getDelta() : 0.016);
    }
};

// Детерминированный цикл симуляции (Fixed Timestep 30 Hz = 33.33ms)
const FIXED_TIMESTEP = 1 / 30;
let simAccumulator = 0;
let simElapsedTime = 0;
let simTickCount = 0;

// Один дискретный шаг симуляции мира
function stepSimulation(delta, currentTime) {
    // 1. Точки сбора ресурсов и подсчёт контроля
    const playerNodesCount = updateResourceNodes(delta, currentTime);

    // 2. Пассивный приток энергии
    energyAccumulator += delta;
    if (energyAccumulator >= 1) {
        energyAccumulator -= 1;
        const baseInc = (typeof getBaseIncome === 'function') ? getBaseIncome() : ENERGY_INCOME_PER_SEC;
        const inc = (baseInc + playerNodesCount * NODE_ENERGY_BONUS);
        energy += inc;
        if (typeof matchStats !== 'undefined' && (typeof benchmarkActive === 'undefined' || !benchmarkActive)) {
            matchStats.energyHarvested += inc;
        }
        updateResourceUI();
    }

    // 3. Таймер волн врагов
    waveTimer -= delta;
    if (waveTimer <= 10 && !waveWarningGiven && gameStarted) {
        waveWarningGiven = true;
        const nextWave = waveNumber + 1;
        const isBoss = (nextWave === 10 || (nextWave > 10 && nextWave % 10 === 0));
        showTacticalAlert(isBoss
            ? (typeof t === 'function' ? t('ALERT_WAVE_10S_BOSS') : `⚠️ ТРЕВОГА: Приближается БОСС «Левиафан» через 10с!`)
            : (typeof t === 'function' ? t('ALERT_WAVE_10S_NORMAL', nextWave) : `🌊 Внимание: Волна ${nextWave} начнётся через 10 секунд!`),
            isBoss);
    }
    if (waveTimer <= 0) {
        waveTimer += (typeof getWaveInterval === 'function' ? getWaveInterval() : WAVE_INTERVAL);
        spawnWave();
    }
    updateWaveUI();

    // 4. Проверка условий контратаки ИИ (диверсии при контроле 3/3 точек)
    checkAIRetaliation(delta);

    // 5. Полоски здоровья штабов
    if (playerHQ && playerHQ.healthBar && playerHQ.hp > 0) updateHealthBar(playerHQ.healthBar, playerHQ.hp, playerHQ.maxHp);
    if (enemyHQ && enemyHQ.healthBar && enemyHQ.hp > 0) updateHealthBar(enemyHQ.healthBar, enemyHQ.hp, enemyHQ.maxHp);

    const totalSimUnits = units.length + enemies.length;
    // Упрощённая SoA-симуляция (пул воркеров или её синхронный вариант) считает только стресс-тест:
    // в ней нет фокус-атаки, обхода стен, сплэша осады, залпов босса, марша волн на штаб и диверсий.
    // Обычный матч всегда идёт через полный FSM ниже.
    const useSimWorker = (typeof simWorkerPool !== 'undefined' && simWorkerPool.enabled &&
        typeof benchmarkActive !== 'undefined' && benchmarkActive);
    let spatialTimeAcc = 0;

    if (useSimWorker) {
        const hqData = {
            playerX: (playerHQ && playerHQ.mesh) ? playerHQ.mesh.position.x : 0,
            playerZ: (playerHQ && playerHQ.mesh) ? playerHQ.mesh.position.z : 0,
            playerHp: playerHQ ? playerHQ.hp : 0,
            enemyX: (enemyHQ && enemyHQ.mesh) ? enemyHQ.mesh.position.x : 0,
            enemyZ: (enemyHQ && enemyHQ.mesh) ? enemyHQ.mesh.position.z : 0,
            enemyHp: enemyHQ ? enemyHQ.hp : 0
        };

        if (simWorkerPool.isMultiThreaded) {
            if (!simWorkerPool.isBusy) {
                simWorkerPool.dispatchParallel(units, enemies, delta, currentTime, hqData);
            }
        } else {
            simWorkerPool.stepSync(units, enemies, delta, currentTime, grid, MAP_WORLD_SIZE, CELL_SIZE, hqData);
        }

        if (typeof engineProfiler !== 'undefined') {
            engineProfiler.fsmTime = simWorkerPool.lastStepDuration;
            engineProfiler.spatialTime = 0;
            const isNaive = (typeof spatialGrid !== 'undefined' && spatialGrid.collisionMode === 'naive');
            engineProfiler.pairsTested = isNaive
                ? simWorkerPool.activeUnits.length * Math.min(simWorkerPool.activeUnits.length, 500)
                : simWorkerPool.activeUnits.length * 9;
        }
    } else {
        // 5.5. Обновление пространственного хеша для O(1) поиска целей и коллизий
        const spatialT0 = performance.now();
        spatialGrid.clear();
        for (let i = 0; i < units.length; i++) {
            if (units[i].hp > 0) spatialGrid.insert(units[i], false);
        }
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].hp > 0) spatialGrid.insert(enemies[i], true);
        }
        spatialTimeAcc = performance.now() - spatialT0;

        // 6. FSM логика союзных юнитов игрока
        const fsmT0 = performance.now();
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
        if (unit.hp <= 0) continue;
        const pos = unit.mesh.position;

        updateHealthBar(unit.healthBar, unit.hp, unit.maxHp, unit.shield || 0, unit.maxShield || 50);

        // Быстрый поиск ближайшего врага через пространственный хеш
        const query = spatialGrid.findNearest(pos, unit.visionRange, 'enemy');
        let nearestEnemy = query.unit;
        let minDist = query.dist;

        if (enemyHQ.hp > 0) {
            const dHQ = pos.distanceTo(enemyHQ.mesh.position);
            if (dHQ < minDist) { minDist = dHQ; nearestEnemy = enemyHQ; }
        }

        // Приказ фокус-атаки (ПКМ по врагу): пока цель жива, она важнее ближайшего врага
        if (unit.orderTarget) {
            if (unit.orderTarget.hp <= 0) {
                unit.orderTarget = null;
            } else if (unit.targetEnemy !== unit.orderTarget &&
                       pos.distanceTo(unit.orderTarget.mesh.position) <= unit.visionRange) {
                unit.targetEnemy = unit.orderTarget;
                if (unit.state !== States.ATTACK) unit.state = States.CHASE;
            }
        }

        switch (unit.state) {
            case States.IDLE:
                unit.velocity.set(0, 0, 0);
                if (nearestEnemy) {
                    unit.targetEnemy = nearestEnemy;
                    unit.state = States.CHASE;
                }
                break;

            case States.MOVE:
                if (nearestEnemy) {
                    unit.targetEnemy = nearestEnemy;
                    unit.state = States.CHASE;
                    break;
                }

                if (unit.personalTarget) {
                    const distToTarget = pos.distanceTo(unit.personalTarget);
                    const stopThreshold = Math.max(0.4, unit.radius * 0.9);
                    if (distToTarget <= stopThreshold) {
                        unit.state = States.IDLE;
                        unit.personalTarget = null;
                        unit.finalApproach = false;
                        unit.velocity.set(0, 0, 0);
                        break;
                    }

                    const gridPos = worldToGrid(pos.x, pos.z);
                    if (gridPos.col >= 0 && gridPos.col < GRID_SIZE && gridPos.row >= 0 && gridPos.row < GRID_SIZE) {
                        // Поле потока своего приказа: новый приказ другой группе не уводит этот отряд к чужой цели
                        let flowX, flowY, cellsToGoal;
                        const ownField = unit.flowField;
                        if (ownField && ownField.width === GRID_SIZE && ownField.flowX.length === GRID_SIZE * GRID_SIZE) {
                            const cellIdx = gridPos.row * GRID_SIZE + gridPos.col;
                            flowX = ownField.flowX[cellIdx];
                            flowY = ownField.flowY[cellIdx];
                            cellsToGoal = ownField.integration[cellIdx];
                        } else {
                            const flowVector = flowFieldGen.flowField[gridPos.row][gridPos.col];
                            flowX = flowVector.x;
                            flowY = flowVector.y;
                            cellsToGoal = flowFieldGen.integrationField[gridPos.row][gridPos.col];
                        }

                        _v1.subVectors(unit.personalTarget, pos);
                        _v1.y = 0;
                        const distance = _v1.length();
                        if (distance > 0.001) _v1.normalize();
                        else _v1.set(1, 0, 0);

                        const hasLOS = hasLineOfSight(pos.x, pos.z, unit.personalTarget.x, unit.personalTarget.z);
                        // Финальный подход: юнит дошёл до клетки цели (или видит своё место рядом) и дальше идёт
                        // прямо на место в строю. Признак запоминается: иначе место дальше ~1 клетки от точки
                        // приказа (длинная шеренга) тянет юнита из клетки цели, а поле потока — обратно, и он
                        // бесконечно дёргается на границе клеток.
                        if (!unit.finalApproach && ((distance < 3.5 && hasLOS) || cellsToGoal <= 1 || (flowX === 0 && flowY === 0))) {
                            unit.finalApproach = true;
                            unit.approachTime = 0;
                            // Запас времени на подход: если место занято или отрезано стеной — остановиться рядом
                            unit.approachLimit = 3 + (distance / Math.max(unit.speed, 0.5)) * 2;
                        }

                        if (unit.finalApproach) {
                            unit.approachTime += delta;
                            if (unit.speed > 0 && unit.approachTime > unit.approachLimit) {
                                unit.state = States.IDLE;
                                unit.personalTarget = null;
                                unit.finalApproach = false;
                                unit.velocity.set(0, 0, 0);
                                break;
                            }
                            if (hasLOS) _v2.copy(_v1);
                            else findBypassDirection(pos.x, pos.z, unit.personalTarget.x, unit.personalTarget.z, _v2);
                        } else {
                            _v3.set(flowX, 0, flowY);
                            // Подтягивание к своему месту в строю — только когда место видно по прямой.
                            // Если между юнитом и местом стена, постоянная тяга «на цель» прижимала его к углу
                            // стены поперёк потока: танк упирался в угол и стоял в MOVE до следующего приказа.
                            if (hasLOS) _v2.lerpVectors(_v3, _v1, 0.25).normalize();
                            else _v2.copy(_v3);
                        }

                        // Плавное торможение перед финишем для предотвращения толкучки и вибраций
                        let currentSpeed = unit.speed;
                        if (distance < 1.6) {
                            currentSpeed *= Math.max(0.25, distance / 1.6);
                        }

                        const step = Math.min(currentSpeed * delta, distance);
                        pos.addScaledVector(_v2, step);
                        unit.velocity.copy(_v2).multiplyScalar(currentSpeed);
                        unit.mesh.rotation.y = THREE.MathUtils.lerpAngle(unit.mesh.rotation.y, Math.atan2(-_v2.z, _v2.x), 10 * delta);
                    }
                }
                break;

            case States.CHASE:
                if (!unit.targetEnemy || unit.targetEnemy.hp <= 0) {
                    if (unit.orderTarget === unit.targetEnemy) unit.orderTarget = null;
                    unit.targetEnemy = null;
                    unit.state = unit.personalTarget ? States.MOVE : States.IDLE;
                    unit.velocity.set(0, 0, 0);
                    break;
                }

                const enemyPos = unit.targetEnemy.mesh.position;
                const distToEnemy = pos.distanceTo(enemyPos);
                // Цель по приказу игрока преследуется на любой дистанции; случайно замеченная — в пределах обзора
                const isOrderedTarget = (unit.orderTarget === unit.targetEnemy);

                if (distToEnemy <= unit.attackRange) {
                    unit.state = States.ATTACK;
                    unit.velocity.set(0, 0, 0);
                } else if (!isOrderedTarget && distToEnemy > unit.visionRange) {
                    unit.targetEnemy = null;
                    unit.state = unit.personalTarget ? States.MOVE : States.IDLE;
                    unit.velocity.set(0, 0, 0);
                } else {
                    // CHASE с учётом препятствий: если прямая заблокирована стеной, обходим угол
                    const los = hasLineOfSight(pos.x, pos.z, enemyPos.x, enemyPos.z);
                    if (los) {
                        _v1.subVectors(enemyPos, pos);
                        _v1.y = 0;
                        _v1.normalize();
                    } else {
                        let followsField = false;
                        const chaseField = isOrderedTarget ? unit.flowField : null;
                        if (chaseField && chaseField.width === GRID_SIZE && chaseField.flowX.length === GRID_SIZE * GRID_SIZE) {
                            // Дальняя цель по приказу: идём к ней по полю потока приказа, а не в лоб через стены
                            const cg = worldToGrid(pos.x, pos.z);
                            if (cg.col >= 0 && cg.col < GRID_SIZE && cg.row >= 0 && cg.row < GRID_SIZE) {
                                const ci = cg.row * GRID_SIZE + cg.col;
                                if (chaseField.flowX[ci] !== 0 || chaseField.flowY[ci] !== 0) {
                                    _v1.set(chaseField.flowX[ci], 0, chaseField.flowY[ci]);
                                    followsField = true;
                                }
                            }
                        }
                        if (!followsField) findBypassDirection(pos.x, pos.z, enemyPos.x, enemyPos.z, _v1);
                    }
                    pos.addScaledVector(_v1, unit.speed * delta);
                    unit.velocity.copy(_v1).multiplyScalar(unit.speed);
                    unit.mesh.rotation.y = THREE.MathUtils.lerpAngle(unit.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
                }
                break;

            case States.ATTACK:
                unit.velocity.set(0, 0, 0);
                if (!unit.targetEnemy || unit.targetEnemy.hp <= 0) {
                    if (unit.orderTarget === unit.targetEnemy) unit.orderTarget = null;
                    unit.targetEnemy = null;
                    unit.state = unit.personalTarget ? States.MOVE : States.IDLE;
                    break;
                }

                const attEnemyPos = unit.targetEnemy.mesh.position;
                const distToAttEnemy = pos.distanceTo(attEnemyPos);

                if (distToAttEnemy > unit.attackRange) {
                    unit.state = States.CHASE;
                } else {
                    _v1.subVectors(attEnemyPos, pos);
                    _v1.y = 0;
                    _v1.normalize();
                    unit.mesh.rotation.y = THREE.MathUtils.lerpAngle(unit.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);

                    if (currentTime - unit.lastAttackTime >= unit.attackCooldown) {
                        unit.lastAttackTime = currentTime;

                        // Урон с учётом щита цели (Босс-Левиафан) — js/units.js
                        applyDamageToEnemy(unit.targetEnemy, unit.damage);

                        fireLaser(pos, attEnemyPos, true, unit.type === 'tank' ? 'heavy' : 'ally');

                        // Осадный сплэш-урон Танка по площади в радиусе 2.2
                        if (unit.isSieged) {
                            spawnExplosion(attEnemyPos, 8);
                            for (let oIdx = 0; oIdx < enemies.length; oIdx++) {
                                const other = enemies[oIdx];
                                if (other !== unit.targetEnemy && other.hp > 0) {
                                    if (other.mesh.position.distanceTo(attEnemyPos) <= 2.2) {
                                        // Сплэш тоже идёт через щит: раньше он бил Левиафана по корпусу мимо щита
                                        applyDamageToEnemy(other, Math.floor(unit.damage * 0.5));
                                        spawnHitFlash(other.mesh.position, true);
                                    }
                                }
                            }
                        }
                    }
                }
                break;
        }

        if (unit.mesh.userData) {
            unit.mesh.userData.velocity.copy(unit.velocity);
        }
    }

    // 7. FSM логика врагов и Босса
    updateEnemiesAI(currentTime, delta);

    if (typeof engineProfiler !== 'undefined') {
        engineProfiler.fsmTime = performance.now() - fsmT0;
    }
    }

    // 7.5. Таймеры способностей (форсаж, щит) — игровая логика, идёт всегда, в том числе когда
    //      анимации моделей ниже пропускаются (инстансинг при 500+ юнитах)
    for (let i = 0; i < units.length; i++) updateUnitAbilityTimers(units[i], delta);

    // 8. Визуальные эффекты дронов (пропеллеры, сопла, пульсация)
    const isInstanced = (typeof instancedRenderer !== 'undefined' && instancedRenderer.enabled);
    if (!isInstanced || totalSimUnits < 500) {
        for (let i = 0; i < units.length; i++) updateUnitVisuals(units[i], currentTime, delta);
        for (let i = 0; i < enemies.length; i++) updateUnitVisuals(enemies[i], currentTime, delta);
    } else {
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].type === 'boss') updateUnitVisuals(enemies[i], currentTime, delta);
        }
    }

    // 9. Гибель и удаление уничтоженных юнитов
    for (let i = units.length - 1; i >= 0; i--) {
        const u = units[i];
        if (u.hp <= 0) {
            spawnExplosion(u.mesh.position, 10);
            spawnScorch(u.mesh.position);
            if (u.simId !== undefined && typeof simWorld !== 'undefined') {
                simWorld.kill(u.simId);
            }
            if (u.mesh.userData) {
                if (u.mesh.userData.shieldMesh && u.mesh.userData.shieldMesh.material) u.mesh.userData.shieldMesh.material.dispose();
                if (u.mesh.userData.siegeMesh && u.mesh.userData.siegeMesh.material) u.mesh.userData.siegeMesh.material.dispose();
            }
            if (u.mesh.parent) u.mesh.parent.remove(u.mesh);
            units.splice(i, 1);
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.hp <= 0) {
            const isBoss = e.type === 'boss';
            spawnExplosion(e.mesh.position, isBoss ? 36 : 10);
            spawnScorch(e.mesh.position);
            if (e.simId !== undefined && typeof simWorld !== 'undefined') {
                simWorld.kill(e.simId);
            }
            if (e.mesh.userData && e.mesh.userData.shieldMesh && e.mesh.userData.shieldMesh.material) {
                e.mesh.userData.shieldMesh.material.dispose();
            }
            if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
            enemies.splice(i, 1);
            const reward = e.reward || ENEMY_KILL_REWARD;
            // Армии стресс-теста энергию не приносят: иначе тест 5000×5000 оставлял игроку десятки тысяч ⚡
            // на продолжение обычного матча (и на рекорд)
            if (typeof benchmarkActive === 'undefined' || !benchmarkActive) energy += reward;
            if (typeof matchStats !== 'undefined' && (typeof benchmarkActive === 'undefined' || !benchmarkActive)) {
                matchStats.energyHarvested += reward;
                matchStats.enemiesKilled++;
                if (isBoss) matchStats.bossesKilled++;
            }
            updateResourceUI();
            if (isBoss && (typeof benchmarkActive === 'undefined' || !benchmarkActive)) {
                showTacticalAlert(typeof t === 'function' ? t('BOSS_DESTROYED_ALERT') : '🏆 БОСС «ЛЕВИАФАН» УНИЧТОЖЕН! (+100⚡)', false);
            }
        }
    }


    // Проверка победы или поражения
    checkGameOverConditions();
    if (typeof checkBenchmarkCompletion === 'function' && typeof benchmarkActive !== 'undefined' && benchmarkActive) {
        checkBenchmarkCompletion();
    }

    // 10. Высокопроизводительное пространственное расталкивание юнитов и коллизии с препятствиями
    const numAllies = units.length;
    const numEnemies = enemies.length;
    const totalUnits = numAllies + numEnemies;

    function resolveUnitEnvironmentCollisions(u) {
        const pos = u.mesh.position;
        const r = u.radius;

        // А. Ограничение границами арены
        const maxBound = (MAP_WORLD_SIZE * 0.5) - (CELL_SIZE * 1.05) - r;
        pos.x = THREE.MathUtils.clamp(pos.x, -maxBound, maxBound);
        pos.z = THREE.MathUtils.clamp(pos.z, -maxBound, maxBound);

        // Б. Коллизии с твердыми кристаллами точек сбора ресурсов (Cylinder Core)
        if (typeof resourceNodes !== 'undefined') {
            for (let rn = 0; rn < resourceNodes.length; rn++) {
                const node = resourceNodes[rn];
                const diffX = pos.x - node.pos.x;
                const diffZ = pos.z - node.pos.z;
                const minD = RESOURCE_CORE_RADIUS + r;
                const dSq = diffX * diffX + diffZ * diffZ;
                if (dSq < minD * minD) {
                    let d = Math.sqrt(dSq);
                    let nx, nz;
                    if (d > 0.0001) {
                        nx = diffX / d;
                        nz = diffZ / d;
                    } else {
                        nx = 1; nz = 0;
                        d = 0.0001;
                    }
                    pos.x = node.pos.x + nx * minD;
                    pos.z = node.pos.z + nz * minD;
                }
            }
        }

        // В. Точные прямоугольные коллизии стен (Circle vs Box AABB) и штабов
        const gridPos = worldToGrid(pos.x, pos.z);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nc = gridPos.col + dx;
                const nr = gridPos.row + dy;
                if (nc >= 0 && nc < GRID_SIZE && nr >= 0 && nr < GRID_SIZE && grid[nr][nc] === 1) {
                    const isHQCell = (nr === HQ_ROW && nc === HQ_COL) || (nr === ENEMY_HQ_ROW && nc === ENEMY_HQ_COL);
                    let minX, maxX, minZ, maxZ;

                    if (isHQCell) {
                        const hqObj = (nr === HQ_ROW && nc === HQ_COL) ? playerHQ : enemyHQ;
                        if (hqObj && hqObj.mesh) {
                            const hqCenter = hqObj.mesh.position;
                            const hw = 1.8; // База штаба 3.6 x 3.6
                            minX = hqCenter.x - hw; maxX = hqCenter.x + hw;
                            minZ = hqCenter.z - hw; maxZ = hqCenter.z + hw;
                        } else {
                            const wallPos = gridToWorld(nc, nr);
                            const hw = 1.8;
                            minX = wallPos.x - hw; maxX = wallPos.x + hw;
                            minZ = wallPos.z - hw; maxZ = wallPos.z + hw;
                        }
                    } else {
                        const wallPos = gridToWorld(nc, nr);
                        // Половина ширины монолита стены: меш рисуется шириной CELL_SIZE * 0.98 (js/terrain.js).
                        // Раньше здесь стояло 0.98 для клетки 2×2 — при клетке 4×4 юниты входили в стену на метр.
                        const hw = CELL_SIZE * 0.49;
                        minX = wallPos.x - hw; maxX = wallPos.x + hw;
                        minZ = wallPos.z - hw; maxZ = wallPos.z + hw;
                    }

                    // Ближайшая точка AABB коробки
                    const clX = Math.max(minX, Math.min(pos.x, maxX));
                    const clZ = Math.max(minZ, Math.min(pos.z, maxZ));
                    const offX = pos.x - clX;
                    const offZ = pos.z - clZ;
                    const distSq = offX * offX + offZ * offZ;

                    if (distSq > 0.000001) {
                        if (distSq < r * r) {
                            const dist = Math.sqrt(distSq);
                            const push = r - dist;
                            pos.x += (offX / dist) * push;
                            pos.z += (offZ / dist) * push;
                        }
                    } else {
                        // Центр юнита оказался внутри коробки препятствия — выталкиваем к ближайшей грани
                        const dL = pos.x - minX;
                        const dR = maxX - pos.x;
                        const dT = pos.z - minZ;
                        const dB = maxZ - pos.z;
                        const minD = Math.min(dL, dR, dT, dB);
                        if (minD === dL) pos.x = minX - r;
                        else if (minD === dR) pos.x = maxX + r;
                        else if (minD === dT) pos.z = minZ - r;
                        else pos.z = maxZ + r;
                    }
                }
            }
        }
    }

    // 10. Высокопроизводительное пространственное расталкивание юнитов и коллизии с препятствиями
    if (!useSimWorker) {
        const sepT0 = performance.now();
        _allActiveUnits.length = 0;
        for (let i = 0; i < units.length; i++) if (units[i].hp > 0) _allActiveUnits.push(units[i]);
        for (let i = 0; i < enemies.length; i++) if (enemies[i].hp > 0) _allActiveUnits.push(enemies[i]);

        spatialGrid.resolveSeparation(_allActiveUnits);
        for (let i = 0; i < _allActiveUnits.length; i++) {
            resolveUnitEnvironmentCollisions(_allActiveUnits[i]);
        }
        spatialTimeAcc += (performance.now() - sepT0);

        if (typeof engineProfiler !== 'undefined') {
            engineProfiler.spatialTime = spatialTimeAcc;
            engineProfiler.pairsTested = spatialGrid.pairsTested;
        }
    }
}

// Главный игровой цикл (Zero-allocation RAF loop c Fixed Timestep симуляции)
function animate(timestamp) {
    requestAnimationFrame(animate);
    const tickT0 = performance.now();
    try {
        if (typeof soundEngine !== 'undefined' && soundEngine.resetTickStats) {
            soundEngine.resetTickStats();
        }
        if (rtsTimer) rtsTimer.update(timestamp);
        const rawDelta = Math.min(rtsTimer ? rtsTimer.getDelta() : (rtsClock ? rtsClock.getDelta() : 0.016), 0.15);
        const currentTime = rtsTimer ? rtsTimer.getElapsed() : (rtsClock ? rtsClock.elapsedTime : (performance.now() * 0.001));

        // Обновление позиции камеры по WASD / Стрелкам (привязано к кадру)
        updateCamera(rawDelta);

        // Обработка очереди ленивых запросов Flow Field
        if (typeof flowFieldGen !== 'undefined' && flowFieldGen.processPendingTarget) {
            flowFieldGen.processPendingTarget();
        }
        if (typeof enemyFlowFieldGen !== 'undefined' && enemyFlowFieldGen.processPendingTarget) {
            enemyFlowFieldGen.processPendingTarget();
        }

        // Детерминированный цикл с защитой от накопления (макс 4 тика за кадр)
        simAccumulator += rawDelta;
        let maxSimulationTicks = 4;
        while (simAccumulator >= FIXED_TIMESTEP && maxSimulationTicks > 0) {
            const simPaused = (typeof isSimulationPaused === 'function') ? isSimulationPaused() : (typeof isGamePaused !== 'undefined' && isGamePaused);
            if (gameStarted && !gameOver && !simPaused) {
                stepSimulation(FIXED_TIMESTEP, simElapsedTime);
            }
            // Игровое время идёт только в бою: не в меню, не на паузе и не после итога матча
            if (gameStarted && !gameOver && !simPaused) {
                simElapsedTime += FIXED_TIMESTEP;
                simTickCount++;
            }
            simAccumulator -= FIXED_TIMESTEP;
            maxSimulationTicks--;
        }
        // Долг по тикам не копим: после долгого кадра игра не должна «догонять» ускоренной перемоткой
        if (simAccumulator > FIXED_TIMESTEP) simAccumulator = FIXED_TIMESTEP;

        // 11. Обновление визуальных эффектов и миникарты
        updateVFX(rawDelta);
        updateExplosions(rawDelta);
        updateMinimap();

        // Сбор телеметрии движка
        if (typeof engineProfiler !== 'undefined') {
            engineProfiler.flowFieldTime = ((typeof flowFieldGen !== 'undefined' && flowFieldGen.lastComputeTime) || 0) +
                                           ((typeof enemyFlowFieldGen !== 'undefined' && enemyFlowFieldGen.lastComputeTime) || 0);
            engineProfiler.audioTime = (typeof soundEngine !== 'undefined') ? soundEngine.tickSynthesisTime : 0;
            engineProfiler.audioVoices = (typeof soundEngine !== 'undefined') ? soundEngine.activeVoices : 0;
            engineProfiler.soundEvents = (typeof soundEngine !== 'undefined') ? soundEngine.soundEventsThisTick : 0;
            engineProfiler.alliesCount = units.length;
            engineProfiler.enemiesCount = enemies.length;
            engineProfiler.totalUnits = units.length + enemies.length;
            let selectedNow = 0;
            for (let i = 0; i < units.length; i++) if (units[i].selected && units[i].hp > 0) selectedNow++;
            engineProfiler.selectedCount = selectedNow;
            if (typeof renderer !== 'undefined' && renderer.info) {
                engineProfiler.drawCalls = renderer.info.render.calls;
                engineProfiler.triangles = renderer.info.render.triangles;
                if (renderer.info.memory) {
                    engineProfiler.geometries = renderer.info.memory.geometries;
                    engineProfiler.textures = renderer.info.memory.textures;
                }
            }
        }

        // 12. Обновление Debug-Overlay и панели способностей
        if (typeof updateDebugOverlay === 'function') {
            updateDebugOverlay(rawDelta);
        }
        if (typeof updatePerfPanel === 'function') {
            updatePerfPanel(timestamp);
        }
        // Таймеры способностей на панели: без этого вызова отсчёт обновлялся только при клике по юниту
        if (typeof updateAbilityUI === 'function' && gameStarted && !gameOver) {
            updateAbilityUI(simElapsedTime);
        }
        // 12.5. GPU Instanced Rendering синхронизация (InstancedMesh)
        if (typeof instancedRenderer !== 'undefined' && instancedRenderer.enabled) {
            for (let i = 0; i < units.length; i++) {
                const u = units[i];
                if (u.mesh) u.mesh.visible = false;
                if (u.healthBar && u.healthBar.group) u.healthBar.group.visible = false;
            }
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.type !== 'boss') {
                    if (e.mesh) e.mesh.visible = false;
                    if (e.healthBar && e.healthBar.group) e.healthBar.group.visible = false;
                }
            }
            instancedRenderer.update(units, enemies, currentTime, rawDelta);
        } else if (typeof instancedRenderer !== 'undefined') {
            for (let i = 0; i < units.length; i++) {
                if (units[i].mesh) units[i].mesh.visible = true;
                if (units[i].healthBar && units[i].healthBar.group) units[i].healthBar.group.visible = true;
            }
            for (let i = 0; i < enemies.length; i++) {
                if (enemies[i].mesh) enemies[i].mesh.visible = true;
                if (enemies[i].healthBar && enemies[i].healthBar.group) enemies[i].healthBar.group.visible = true;
            }
            instancedRenderer.clear();
        }

        // 13. Финальный рендер кадра
        const renderT0 = performance.now();
        renderer.render(scene, camera);
    if (typeof engineProfiler !== 'undefined') {
        engineProfiler.renderTime = performance.now() - renderT0;
        engineProfiler.totalTickTime = performance.now() - tickT0;
    }
    } catch (err) {
        console.error('Ошибка в игровом цикле animate():', err);
        if (typeof showSystemError === 'function') {
            showSystemError(err, 'Игровой цикл (animate)');
        }
    }
}

// Старт игрового цикла
animate();