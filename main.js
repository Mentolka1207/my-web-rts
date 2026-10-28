// =============================================================================
// main.js — Главный оркестратор и игровой цикл Minimal Web RTS
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
    simWorkerManager.init();
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
        const inc = (ENERGY_INCOME_PER_SEC + playerNodesCount * NODE_ENERGY_BONUS);
        energy += inc;
        if (typeof matchStats !== 'undefined') matchStats.energyHarvested += inc;
        updateResourceUI();
    }

    // 3. Таймер волн врагов
    waveTimer -= delta;
    if (waveTimer <= 10 && !waveWarningGiven && gameStarted) {
        waveWarningGiven = true;
        const nextWave = waveNumber + 1;
        const isBoss = (nextWave === 10 || (nextWave > 10 && nextWave % 10 === 0));
        showTacticalAlert(isBoss ? `⚠️ ТРЕВОГА: Приближается БОСС «Левиафан» через 10с!` : `🌊 Внимание: Волна ${nextWave} начнётся через 10 секунд!`, isBoss);
    }
    if (waveTimer <= 0) {
        waveTimer += WAVE_INTERVAL;
        spawnWave();
    }
    updateWaveUI();

    // 4. Проверка условий контратаки ИИ (диверсии при контроле 3/3 точек)
    checkAIRetaliation(delta);

    // 5. Полоски здоровья штабов
    if (playerHQ.hp > 0) updateHealthBar(playerHQ.healthBar, playerHQ.hp, playerHQ.maxHp);
    if (enemyHQ.hp > 0) updateHealthBar(enemyHQ.healthBar, enemyHQ.hp, enemyHQ.maxHp);

    // 5.5. Обновление пространственного хеша для O(1) поиска целей и коллизий
    const spatialT0 = performance.now();
    spatialGrid.clear();
    for (let i = 0; i < units.length; i++) {
        if (units[i].hp > 0) spatialGrid.insert(units[i], false);
    }
    for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].hp > 0) spatialGrid.insert(enemies[i], true);
    }
    let spatialTimeAcc = performance.now() - spatialT0;

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
                        unit.velocity.set(0, 0, 0);
                        break;
                    }

                    const gridPos = worldToGrid(pos.x, pos.z);
                    if (gridPos.col >= 0 && gridPos.col < GRID_SIZE && gridPos.row >= 0 && gridPos.row < GRID_SIZE) {
                        const flowVector = flowFieldGen.flowField[gridPos.row][gridPos.col];
                        _v1.subVectors(unit.personalTarget, pos);
                        _v1.y = 0;
                        const distance = _v1.length();
                        if (distance > 0.001) _v1.normalize();
                        else _v1.set(1, 0, 0);

                        const hasLOS = hasLineOfSight(pos.x, pos.z, unit.personalTarget.x, unit.personalTarget.z);
                        if ((distance < 3.5 && hasLOS) || (flowVector.x === 0 && flowVector.y === 0)) {
                            _v2.copy(_v1);
                        } else {
                            _v3.set(flowVector.x, 0, flowVector.y);
                            _v2.lerpVectors(_v3, _v1, 0.25).normalize();
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
                    unit.targetEnemy = null;
                    unit.state = unit.personalTarget ? States.MOVE : States.IDLE;
                    unit.velocity.set(0, 0, 0);
                    break;
                }

                const enemyPos = unit.targetEnemy.mesh.position;
                const distToEnemy = pos.distanceTo(enemyPos);

                if (distToEnemy <= unit.attackRange) {
                    unit.state = States.ATTACK;
                    unit.velocity.set(0, 0, 0);
                } else if (distToEnemy > unit.visionRange) {
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
                        findBypassDirection(pos.x, pos.z, enemyPos.x, enemyPos.z, _v1);
                    }
                    pos.addScaledVector(_v1, unit.speed * delta);
                    unit.velocity.copy(_v1).multiplyScalar(unit.speed);
                    unit.mesh.rotation.y = THREE.MathUtils.lerpAngle(unit.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
                }
                break;

            case States.ATTACK:
                unit.velocity.set(0, 0, 0);
                if (!unit.targetEnemy || unit.targetEnemy.hp <= 0) {
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

                        // Поглощение урона щитом (для Босса-Левиафана)
                        if (unit.targetEnemy.shield && unit.targetEnemy.shield > 0) {
                            if (typeof playHitSound === 'function') playHitSound(true);
                            unit.targetEnemy.shield -= unit.damage;
                            if (unit.targetEnemy.shieldMesh) {
                                unit.targetEnemy.shieldMesh.material.opacity = 0.85;
                            }
                            if (unit.targetEnemy.shield <= 0) {
                                unit.targetEnemy.shield = 0;
                                if (unit.targetEnemy.shieldMesh) unit.targetEnemy.shieldMesh.visible = false;
                                spawnExplosion(unit.targetEnemy.mesh.position, 18);
                                showTacticalAlert('⚡ ЩИТ ЛЕВИАФАНА ПРОБИТ!', false);
                            }
                        } else {
                            unit.targetEnemy.hp -= unit.damage;
                        }

                        fireLaser(pos, attEnemyPos, true, unit.type === 'tank' ? 'heavy' : 'ally');

                        // Осадный сплэш-урон Танка по площади в радиусе 2.2
                        if (unit.isSieged) {
                            spawnExplosion(attEnemyPos, 8);
                            for (let oIdx = 0; oIdx < enemies.length; oIdx++) {
                                const other = enemies[oIdx];
                                if (other !== unit.targetEnemy && other.hp > 0) {
                                    if (other.mesh.position.distanceTo(attEnemyPos) <= 2.2) {
                                        other.hp -= Math.floor(unit.damage * 0.5);
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

    // 8. Визуальные эффекты дронов (пропеллеры, сопла, пульсация)
    for (let i = 0; i < units.length; i++) updateUnitVisuals(units[i], currentTime, delta);
    for (let i = 0; i < enemies.length; i++) updateUnitVisuals(enemies[i], currentTime, delta);

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
            scene.remove(u.mesh);
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
            scene.remove(e.mesh);
            enemies.splice(i, 1);
            const reward = e.reward || ENEMY_KILL_REWARD;
            energy += reward;
            if (typeof matchStats !== 'undefined') {
                matchStats.energyHarvested += reward;
                matchStats.enemiesKilled++;
                if (isBoss) matchStats.bossesKilled++;
            }
            updateResourceUI();
            if (isBoss) {
                showTacticalAlert('🏆 БОСС «ЛЕВИАФАН» УНИЧТОЖЕН! (+100⚡)', false);
            }
        }
    }

    // Фиксация времени FSM и способностей
    if (typeof engineProfiler !== 'undefined') {
        engineProfiler.fsmTime = performance.now() - fsmT0;
    }

    // Проверка победы или поражения
    checkGameOverConditions();

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
                        const hqObj = (nr === HQ_ROW) ? playerHQ : enemyHQ;
                        const hqCenter = hqObj.mesh.position;
                        const hw = 1.8; // База штаба 3.6 x 3.6
                        minX = hqCenter.x - hw; maxX = hqCenter.x + hw;
                        minZ = hqCenter.z - hw; maxZ = hqCenter.z + hw;
                    } else {
                        const wallPos = gridToWorld(nc, nr);
                        const hw = 0.98; // Монолит 1.96 x 1.96
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

    // Двухэтапная релаксация: расталкивание юнитов + твердые препятствия
    const sepT0 = performance.now();
    _allActiveUnits.length = 0;
    for (let i = 0; i < units.length; i++) if (units[i].hp > 0) _allActiveUnits.push(units[i]);
    for (let i = 0; i < enemies.length; i++) if (enemies[i].hp > 0) _allActiveUnits.push(enemies[i]);

    spatialGrid.resolveSeparation(_allActiveUnits);
    for (let i = 0; i < totalUnits; i++) {
        const u = i < numAllies ? units[i] : enemies[i - numAllies];
        if (u.hp > 0) resolveUnitEnvironmentCollisions(u);
    }
    spatialGrid.resolveSeparation(_allActiveUnits);
    for (let i = 0; i < totalUnits; i++) {
        const u = i < numAllies ? units[i] : enemies[i - numAllies];
        if (u.hp > 0) resolveUnitEnvironmentCollisions(u);
    }
    spatialTimeAcc += (performance.now() - sepT0);

    if (typeof engineProfiler !== 'undefined') {
        engineProfiler.spatialTime = spatialTimeAcc;
        engineProfiler.pairsTested = spatialGrid.pairsTested;
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
        const rawDelta = Math.min(rtsTimer ? rtsTimer.getDelta() : rtsClock.getDelta(), 0.15);
        const currentTime = rtsTimer ? rtsTimer.getElapsed() : rtsClock.elapsedTime;

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
            if (gameStarted && !gameOver) {
                stepSimulation(FIXED_TIMESTEP, simElapsedTime);
            }
            simElapsedTime += FIXED_TIMESTEP;
            simTickCount++;
            simAccumulator -= FIXED_TIMESTEP;
            maxSimulationTicks--;
        }

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
            engineProfiler.selectedCount = units.filter(u => u.selected && u.hp > 0).length;
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