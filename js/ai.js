// =============================================================================
// js/ai.js — Искусственный интеллект, волны врагов, Босс и тактические контратаки
// =============================================================================

const WAVE_INTERVAL = 60;
let waveNumber = 0;
let waveTimer = WAVE_INTERVAL;
let waveWarningGiven = false;
let lastHQAlertTime = 0;
const waveNumberEl = document.getElementById('wave-number');
const waveTimerEl = document.getElementById('wave-timer');

// Нанесение урона союзнику с учётом поглощения энергетическим щитом
function applyDamageToAlly(target, amount) {
    if (target.shield && target.shield > 0) {
        if (target.shield >= amount) {
            target.shield -= amount;
        } else {
            const remainder = amount - target.shield;
            target.shield = 0;
            target.hp -= remainder;
        }
        if (target.shield <= 0 && target.mesh && target.mesh.userData && target.mesh.userData.shieldMesh) {
            target.mesh.userData.shieldMesh.visible = false;
        }
    } else {
        target.hp -= amount;
    }
}

// Спавн волн врагов
function spawnWave() {
    waveWarningGiven = false;
    waveNumber++;

    const waveRoster = [];

    if (waveNumber === 10 || (waveNumber > 10 && waveNumber % 10 === 0)) {
        // БОСС-ВОЛНА: Левиафан во главе ударной флотилии
        waveRoster.push('boss');
        waveRoster.push('tank', 'tank');
        for (let i = 0; i < 4; i++) waveRoster.push('scout');
        for (let i = 0; i < 3; i++) waveRoster.push('standard');
        showTacticalAlert(`⚠️ ВНИМАНИЕ: ВОЛНА ${waveNumber} — ПРИБЛИЖАЕТСЯ ЛЕВИАФАН!`, true);
    } else {
        // Базовые дроны
        const standardCount = Math.min(8, 3 + Math.floor(waveNumber * 0.5));
        for (let i = 0; i < standardCount; i++) waveRoster.push('standard');

        // С волны 3+ появляются быстрые Разведчики (фланговый наскок)
        if (waveNumber >= 3) {
            const scoutCount = Math.min(6, 1 + Math.floor((waveNumber - 2) * 0.8));
            for (let i = 0; i < scoutCount; i++) waveRoster.push('scout');
        }

        // С волны 5+ появляются тяжёлые Танки (прорыв обороны)
        if (waveNumber >= 5) {
            const tankCount = Math.min(4, 1 + Math.floor((waveNumber - 4) * 0.5));
            for (let i = 0; i < tankCount; i++) waveRoster.push('tank');
        }

        if (waveNumber >= 5) {
            showTacticalAlert(`🌊 Волна ${waveNumber}: зафиксированы вражеские Танки и Разведчики!`, false);
        } else if (waveNumber >= 3) {
            showTacticalAlert(`🌊 Волна ${waveNumber}: зафиксированы быстрые фланговые Разведчики!`, false);
        }
    }

    // Ограничение максимального размера волны (Cap)
    if (waveRoster.length > MAX_WAVE_SIZE) {
        waveRoster.length = MAX_WAVE_SIZE;
    }

    // Ограничение общего количества активных врагов на карте для сохранения 60 FPS
    const activeCount = enemies.length;
    const spawnBudget = Math.max(0, MAX_ACTIVE_ENEMIES - activeCount);
    const countToSpawn = Math.min(waveRoster.length, spawnBudget);

    for (let i = 0; i < countToSpawn; i++) {
        const uType = waveRoster[i];
        const spot = findFreeCellNear(ENEMY_HQ_COL, ENEMY_HQ_ROW);
        const worldPos = gridToWorld(spot.col, spot.row);
        createEnemy(worldPos.x, worldPos.z, uType, true);
    }
}

function updateWaveUI() {
    if (waveNumberEl) waveNumberEl.textContent = waveNumber;
    if (waveTimerEl) waveTimerEl.textContent = Math.max(0, Math.ceil(waveTimer));
}

// Ответные действия ИИ: отправка диверсионных отрядов при контроле 3/3 точек
let retaliationCooldown = 0;
const RETALIATION_COOLDOWN_TIME = 35; // раз в 35 сек при полном контроле карты игроком

function checkAIRetaliation(delta) {
    if (gameOver || !gameStarted) return;

    const playerNodes = resourceNodes.filter(n => n.owner === 'player');
    if (playerNodes.length === resourceNodes.length && enemyHQ.hp > 0) {
        retaliationCooldown -= delta;
        if (retaliationCooldown <= 0) {
            retaliationCooldown = RETALIATION_COOLDOWN_TIME;

            // Находим точку, ближайшую к вражескому штабу
            const hqPos = enemyHQ.mesh.position;
            let targetNode = playerNodes[0];
            let minDist = Math.hypot(targetNode.pos.x - hqPos.x, targetNode.pos.z - hqPos.z);
            for (let i = 1; i < playerNodes.length; i++) {
                const node = playerNodes[i];
                const d = Math.hypot(node.pos.x - hqPos.x, node.pos.z - hqPos.z);
                if (d < minDist) {
                    minDist = d;
                    targetNode = node;
                }
            }

            // Диверсионный отряд: 2 быстрых Разведчика + 1 Танк
            const sabotageRoster = ['scout', 'scout', 'tank'];
            for (let i = 0; i < sabotageRoster.length; i++) {
                const uType = sabotageRoster[i];
                const spot = findFreeCellNear(ENEMY_HQ_COL, ENEMY_HQ_ROW);
                const worldPos = gridToWorld(spot.col, spot.row);
                createEnemy(worldPos.x, worldPos.z, uType, false, targetNode);
            }

            showTacticalAlert(`🚨 ДИВЕРСИЯ: Вражеский отряд направлен на отбитие точки «${targetNode.name}»!`, true);
        }
    } else {
        if (retaliationCooldown < 10) retaliationCooldown = 10;
    }
}

// Поведение и логика FSM для всех вражеских юнитов
function updateEnemiesAI(currentTime, delta) {
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.hp <= 0) continue;
        const pos = enemy.mesh.position;

        updateHealthBar(enemy.healthBar, enemy.hp, enemy.maxHp, enemy.shield, enemy.maxShield);

        // Поиск ближайшего союзника через пространственный хеш O(1) вместо O(n)
        const targetQuery = spatialGrid.findNearest(pos, enemy.visionRange, 'ally');
        let nearestAlly = targetQuery.unit;

        if (nearestAlly) {
            enemy.roamTarget = null;
            const allyPos = nearestAlly.mesh.position;
            const dist = pos.distanceTo(allyPos);

            if (dist <= enemy.attackRange) {
                enemy.velocity.set(0, 0, 0);
                _v1.subVectors(allyPos, pos);
                _v1.y = 0;
                _v1.normalize();
                enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);

                if (currentTime - enemy.lastAttackTime >= enemy.attackCooldown) {
                    enemy.lastAttackTime = currentTime;

                    if (enemy.type === 'boss') {
                        // Залповый огонь Босса по нескольким целям
                        const targets = [];
                        for (let uIdx = 0; uIdx < units.length; uIdx++) {
                            const u = units[uIdx];
                            if (u.hp > 0 && pos.distanceTo(u.mesh.position) <= enemy.attackRange) {
                                targets.push(u);
                                if (targets.length >= 3) break;
                            }
                        }
                        if (targets.length < 3 && playerHQ.hp > 0 && pos.distanceTo(playerHQ.mesh.position) <= enemy.attackRange + playerHQ.radius) {
                            targets.push(playerHQ);
                        }
                        if (targets.length <= 1) {
                            // Одиночная цель — тройной концентрированный залп
                            applyDamageToAlly(nearestAlly, enemy.damage);
                            fireLaser(pos, allyPos, false);
                            _v2.copy(allyPos);
                            _v2.x += 0.3; _v2.z += 0.3;
                            fireLaser(pos, _v2, false);
                            _v3.copy(allyPos);
                            _v3.x -= 0.3; _v3.z -= 0.3;
                            fireLaser(pos, _v3, false);
                        } else {
                            // Залп веером по всем целям
                            for (let t = 0; t < targets.length; t++) {
                                const tgt = targets[t];
                                applyDamageToAlly(tgt, Math.floor(enemy.damage * 0.75));
                                fireLaser(pos, tgt.mesh.position, false);
                            }
                        }
                    } else {
                        // Стандартный одиночный выстрел
                        applyDamageToAlly(nearestAlly, enemy.damage);
                        fireLaser(pos, allyPos, false);
                    }
                }
            } else {
                // CHASE с учётом препятствий: если прямая заблокирована стеной, обходим угол
                const los = hasLineOfSight(pos.x, pos.z, allyPos.x, allyPos.z);
                if (los) {
                    _v1.subVectors(allyPos, pos);
                    _v1.y = 0;
                    _v1.normalize();
                } else {
                    findBypassDirection(pos.x, pos.z, allyPos.x, allyPos.z, _v1);
                }
                pos.addScaledVector(_v1, enemy.speed * delta);
                enemy.velocity.copy(_v1).multiplyScalar(enemy.speed);
                enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
            }
        } else if (enemy.sabotageNode) {
            // ДИВЕРСИОННЫЙ ОТРЯД: марш на отбитие захваченной точки
            if (enemy.sabotageNode.owner === 'enemy') {
                // Точка отбита — переходим в штурм штаба
                enemy.sabotageNode = null;
                enemy.isWaveUnit = true;
            } else {
                const targetPos = enemy.sabotageNode.pos;
                const distToNode = Math.hypot(pos.x - targetPos.x, pos.z - targetPos.z);

                if (distToNode <= CAPTURE_RADIUS - 0.5) {
                    enemy.velocity.set(0, 0, 0);
                    enemy.mesh.rotation.y += delta * 1.5;
                } else {
                    _v1.subVectors(targetPos, pos);
                    _v1.y = 0;
                    _v1.normalize();
                    pos.addScaledVector(_v1, enemy.speed * delta);
                    enemy.velocity.copy(_v1).multiplyScalar(enemy.speed);
                    enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
                }
            }
        } else if (enemy.isWaveUnit) {
            // Штурм штаба игрока
            enemy.roamTarget = null;
            const hqPos = playerHQ.mesh.position;
            const distToHQ = pos.distanceTo(hqPos);
            const engageRange = enemy.attackRange + playerHQ.radius;

            if (distToHQ <= engageRange) {
                enemy.velocity.set(0, 0, 0);
                _v1.subVectors(hqPos, pos);
                _v1.y = 0;
                _v1.normalize();
                enemy.mesh.rotation.y = Math.atan2(-_v1.z, _v1.x);

                if (currentTime - enemy.lastAttackTime >= enemy.attackCooldown) {
                    enemy.lastAttackTime = currentTime;
                    playerHQ.hp -= (enemy.type === 'boss' ? 30 : 12);
                    fireLaser(pos, hqPos, false);
                    if (currentTime - lastHQAlertTime > 8.0 && typeof showTacticalAlert === 'function') {
                        lastHQAlertTime = currentTime;
                        showTacticalAlert('🚨 ВНИМАНИЕ: Наш штаб находится под атакой!', true);
                    }
                    if (enemy.type === 'boss') {
                        _v2.copy(hqPos);
                        _v2.x += 0.4; _v2.z += 0.4;
                        fireLaser(pos, _v2, false);
                    }
                }
            } else {
                const gridPos = worldToGrid(pos.x, pos.z);
                _v1.subVectors(hqPos, pos);
                _v1.y = 0;
                _v1.normalize();

                if (gridPos.col >= 0 && gridPos.col < GRID_SIZE && gridPos.row >= 0 && gridPos.row < GRID_SIZE) {
                    const flowVector = enemyFlowFieldGen.flowField[gridPos.row][gridPos.col];
                    if (flowVector.x !== 0 || flowVector.y !== 0) {
                        _v1.set(flowVector.x, 0, flowVector.y);
                    }
                }

                pos.addScaledVector(_v1, enemy.speed * delta);
                enemy.velocity.copy(_v1).multiplyScalar(enemy.speed);
                enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
            }
        } else {
            // Патрулирование обычной картой
            if (enemy.state === States.IDLE) {
                enemy.velocity.set(0, 0, 0);
                enemy.roamCooldown -= delta;

                if (enemy.roamCooldown <= 0) {
                    if (Math.random() < 0.35 && resourceNodes.length > 0) {
                        const targetNode = resourceNodes[Math.floor(Math.random() * resourceNodes.length)];
                        if (!enemy.roamTarget) enemy.roamTarget = new THREE.Vector3();
                        enemy.roamTarget.set(
                            targetNode.pos.x + (Math.random() - 0.5) * 2,
                            0.75,
                            targetNode.pos.z + (Math.random() - 0.5) * 2
                        );
                    } else {
                        let col = 1, row = 1;
                        for (let attempt = 0; attempt < 50; attempt++) {
                            const rc = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                            const rr = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                            if (grid[rr][rc] === 0) {
                                col = rc; row = rr;
                                break;
                            }
                        }
                        const worldPos = gridToWorld(col, row);
                        if (!enemy.roamTarget) enemy.roamTarget = new THREE.Vector3();
                        enemy.roamTarget.set(worldPos.x, 0.75, worldPos.z);
                    }
                    enemy.state = States.MOVE;
                }
            } else if (enemy.state === States.MOVE && enemy.roamTarget) {
                const distToRoam = pos.distanceTo(enemy.roamTarget);
                if (distToRoam < 0.25) {
                    enemy.state = States.IDLE;
                    enemy.roamCooldown = Math.random() * 4 + 2;
                    enemy.velocity.set(0, 0, 0);
                } else {
                    _v1.subVectors(enemy.roamTarget, pos);
                    _v1.y = 0;
                    _v1.normalize();
                    pos.addScaledVector(_v1, enemy.speed * delta);
                    enemy.velocity.copy(_v1).multiplyScalar(enemy.speed);
                    enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
                }
            }
        }

        if (enemy.mesh.userData) {
            enemy.mesh.userData.velocity.copy(enemy.velocity);
        }
    }
}
