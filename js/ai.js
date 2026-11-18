// =============================================================================
// js/ai.js — Искусственный интеллект, волны врагов, Босс и тактические контратаки
// =============================================================================

const WAVE_INTERVAL = 60;
let waveNumber = 0;

function getWaveInterval() {
    return (typeof DIFFICULTY_CONFIGS !== 'undefined' && typeof currentDifficulty !== 'undefined' && DIFFICULTY_CONFIGS[currentDifficulty])
        ? DIFFICULTY_CONFIGS[currentDifficulty].waveInterval
        : WAVE_INTERVAL;
}

let waveTimer = WAVE_INTERVAL;
let waveWarningGiven = false;
let lastHQAlertTime = 0;
const waveNumberEl = document.getElementById('wave-number');
const waveTimerEl = document.getElementById('wave-timer');

// Нанесение урона союзнику с учётом поглощения энергетическим щитом
function applyDamageToAlly(target, amount) {
    if (target.shield && target.shield > 0) {
        if (typeof playHitSound === 'function') playHitSound(true);
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

function getMaxActiveEnemies() {
    if (typeof MAP_SIZE_CONFIGS !== 'undefined' && typeof currentMapSize !== 'undefined' &&
        MAP_SIZE_CONFIGS[currentMapSize] && typeof MAP_SIZE_CONFIGS[currentMapSize].maxActiveEnemies === 'number') {
        return MAP_SIZE_CONFIGS[currentMapSize].maxActiveEnemies;
    }
    return (typeof MAX_ACTIVE_ENEMIES !== 'undefined') ? MAX_ACTIVE_ENEMIES : 50;
}

function getEnemyMarchSpeedMult() {
    if (typeof MAP_SIZE_CONFIGS !== 'undefined' && typeof currentMapSize !== 'undefined' &&
        MAP_SIZE_CONFIGS[currentMapSize] && typeof MAP_SIZE_CONFIGS[currentMapSize].enemyMarchSpeedMult === 'number') {
        return MAP_SIZE_CONFIGS[currentMapSize].enemyMarchSpeedMult;
    }
    return 1.0;
}

function buildWaveRoster(targetWave, maxWaveSize = (typeof MAX_WAVE_SIZE !== 'undefined' ? MAX_WAVE_SIZE : 25)) {
    const waveRoster = [];

    if (targetWave === 10 || (targetWave > 10 && targetWave % 10 === 0)) {
        // БОСС-ВОЛНА: Левиафан во главе ударной флотилии
        waveRoster.push('boss');
        waveRoster.push('tank', 'tank');
        for (let i = 0; i < 4; i++) waveRoster.push('scout');
        for (let i = 0; i < 3; i++) waveRoster.push('standard');
    } else if (targetWave % 3 === 0) {
        // Волна «Рой перехватчиков»
        const swarmCount = Math.min(8, 3 + Math.floor(targetWave * 0.7));
        for (let i = 0; i < swarmCount; i++) waveRoster.push('scout');
        waveRoster.push('tank');
    } else if (targetWave % 4 === 0) {
        // Волна «Осадный таран»
        const armorTanks = Math.min(4, 2 + Math.floor(targetWave / 3));
        for (let i = 0; i < armorTanks; i++) waveRoster.push('tank');
        for (let i = 0; i < 4; i++) waveRoster.push('standard');
    } else {
        // Сбалансированная волна
        const standardCount = Math.min(8, 3 + Math.floor(targetWave * 0.5));
        for (let i = 0; i < standardCount; i++) waveRoster.push('standard');

        if (targetWave >= 3) {
            const scoutCount = Math.min(6, 1 + Math.floor((targetWave - 2) * 0.8));
            for (let i = 0; i < scoutCount; i++) waveRoster.push('scout');
        }

        if (targetWave >= 5) {
            const tankCount = Math.min(4, 1 + Math.floor((targetWave - 4) * 0.5));
            for (let i = 0; i < tankCount; i++) waveRoster.push('tank');
        }
    }

    if (waveRoster.length > maxWaveSize) {
        waveRoster.length = maxWaveSize;
    }
    return waveRoster;
}

// Спавн волн врагов
function spawnWave() {
    waveWarningGiven = false;
    waveNumber++;

    const isBossWave = (waveNumber === 10 || (waveNumber > 10 && waveNumber % 10 === 0));
    if (typeof playWaveSound === 'function') playWaveSound(isBossWave);

    const waveRoster = buildWaveRoster(waveNumber, MAX_WAVE_SIZE);

    if (typeof showTacticalAlert === 'function') {
        if (isBossWave) {
            showTacticalAlert(typeof t === 'function' ? t('ALERT_LEVIATHAN', waveNumber) : `⚠️ ВНИМАНИЕ: ВОЛНА ${waveNumber} — ПРИБЛИЖАЕТСЯ ЛЕВИАФАН!`, true);
        } else if (waveNumber % 3 === 0) {
            showTacticalAlert(typeof t === 'function' ? t('ALERT_SWARM', waveNumber) : `🌊 Волна ${waveNumber}: РОЙ ПЕРЕХВАТЧИКОВ! Приготовьте плотный строй!`, false);
        } else if (waveNumber % 4 === 0) {
            showTacticalAlert(typeof t === 'function' ? t('ALERT_ARMORED', waveNumber) : `🌊 Волна ${waveNumber}: ОСАДНЫЙ ТАРАН! Требуется осадный режим или фокус огня!`, false);
        } else {
            showTacticalAlert(typeof t === 'function' ? t('ALERT_STANDARD', waveNumber) : `🌊 Надвигается Волна ${waveNumber}! Защищайте периметр базы!`, false);
        }
    }

    // Ограничение общего количества активных врагов на карте с учётом масштаба карты
    const activeCount = enemies.length;
    const spawnBudget = Math.max(0, getMaxActiveEnemies() - activeCount);
    const countToSpawn = Math.min(waveRoster.length, spawnBudget);

    for (let i = 0; i < countToSpawn; i++) {
        const uType = waveRoster[i];
        const spot = findFreeCellNear(ENEMY_HQ_COL, ENEMY_HQ_ROW);
        const worldPos = gridToWorld(spot.col, spot.row);
        createEnemy(worldPos.x, worldPos.z, uType, true);
    }
}

// Панель волны перерисовывается, только когда меняется видимый текст (секунда, номер волны, язык),
// а не 30 раз в секунду на каждом тике симуляции
let lastWavePanelHtml = '';
function updateWaveUI() {
    const waveEl = document.getElementById('wave-panel');
    if (waveEl) {
        const waveLbl = typeof t === 'function' ? t('WAVE_LABEL') : '🌊 Волна';
        const nextIn = typeof t === 'function' ? t('WAVE_NEXT_IN') : '— след. через';
        const sec = typeof t === 'function' ? t('SEC_SHORT') : 'с';
        const html = `${waveLbl} <span id="wave-number">${waveNumber}</span> ${nextIn} <span id="wave-timer">${Math.max(0, Math.ceil(waveTimer))}</span>${sec}`;
        if (html !== lastWavePanelHtml) {
            lastWavePanelHtml = html;
            waveEl.innerHTML = html;
        }
    }
}

// Ответные действия ИИ: отправка диверсионных отрядов при контроле 3/3 точек
let retaliationCooldown = 0;
const RETALIATION_COOLDOWN_TIME = 35; // раз в 35 сек при полном контроле карты игроком

// Снимок поля потока врагов к произвольной клетке (маршрут диверсантов к точке сбора).
// Считается в рабочих буферах поля волн и тут же возвращает их к цели «штаб игрока»
// (второй вызов — попадание в кэш), поэтому волны промежуточного состояния не видят.
function buildEnemyFieldTo(col, row) {
    if (typeof enemyFlowFieldGen === 'undefined' || typeof enemyFlowFieldGen.getActiveField !== 'function') return null;
    enemyFlowFieldGen.updateTarget(col, row);
    const field = enemyFlowFieldGen.getActiveField();
    enemyFlowFieldGen.updateTarget(HQ_COL, HQ_ROW);
    return field;
}

function checkAIRetaliation(delta) {
    if (gameOver || !gameStarted) return;

    const playerNodes = resourceNodes.filter(n => n.owner === 'player');
    if (resourceNodes.length > 0 && playerNodes.length === resourceNodes.length && enemyHQ.hp > 0) {
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
            // Маршрут до точки — по полю потока. Обход «ближайшей свободной клеткой» в лабиринте
            // заводил отряд в тупик, и до точки он не доходил вовсе.
            const sabotageField = buildEnemyFieldTo(targetNode.col, targetNode.row);
            for (let i = 0; i < sabotageRoster.length; i++) {
                const uType = sabotageRoster[i];
                const spot = findFreeCellNear(ENEMY_HQ_COL, ENEMY_HQ_ROW);
                const worldPos = gridToWorld(spot.col, spot.row);
                createEnemy(worldPos.x, worldPos.z, uType, false, targetNode);
                enemies[enemies.length - 1].sabotageField = sabotageField;
            }

            showTacticalAlert(typeof t === 'function' ? t('ALERT_SABOTAGE', targetNode.name) : `🚨 ДИВЕРСИЯ: Вражеский отряд направлен на отбитие точки «${targetNode.name}»!`, true);
        }
    } else {
        if (retaliationCooldown < 10) retaliationCooldown = 10;
    }
}

// Урон врага по штабу игрока: учитывает тип врага и множитель сложности (как и урон по юнитам в createEnemy)
function getEnemyHQDamage(enemy) {
    if (enemy && typeof enemy.damage === 'number' && isFinite(enemy.damage) && enemy.damage > 0) {
        return enemy.damage;
    }
    const baseStats = (typeof ENEMY_TYPES !== 'undefined' && enemy && ENEMY_TYPES[enemy.type])
        ? ENEMY_TYPES[enemy.type]
        : { damage: (enemy && enemy.type === 'boss') ? 38 : 12 };
    const dmgMult = (typeof DIFFICULTY_CONFIGS !== 'undefined' && typeof currentDifficulty !== 'undefined' && DIFFICULTY_CONFIGS[currentDifficulty])
        ? DIFFICULTY_CONFIGS[currentDifficulty].enemyDamageMult
        : 1.0;
    return Math.round(baseStats.damage * dmgMult);
}

// Поведение и логика FSM для всех вражеских юнитов
function updateEnemiesAI(currentTime, delta) {
    const marchMult = getEnemyMarchSpeedMult();
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
                        if (targets.length < 3 && playerHQ && playerHQ.mesh && playerHQ.hp > 0 && pos.distanceTo(playerHQ.mesh.position) <= enemy.attackRange + playerHQ.radius) {
                            targets.push(playerHQ);
                        }
                        if (targets.length <= 1) {
                            // Одиночная цель — тройной концентрированный залп
                            applyDamageToAlly(nearestAlly, enemy.damage);
                            fireLaser(pos, allyPos, false, 'boss');
                            _v2.copy(allyPos);
                            _v2.x += 0.3; _v2.z += 0.3;
                            fireLaser(pos, _v2, false, 'boss');
                            _v3.copy(allyPos);
                            _v3.x -= 0.3; _v3.z -= 0.3;
                            fireLaser(pos, _v3, false, 'boss');
                        } else {
                            // Залп веером по всем целям
                            for (let t = 0; t < targets.length; t++) {
                                const tgt = targets[t];
                                applyDamageToAlly(tgt, Math.floor(enemy.damage * 0.75));
                                fireLaser(pos, tgt.mesh.position, false, 'boss');
                            }
                        }
                    } else {
                        // Стандартный одиночный выстрел
                        applyDamageToAlly(nearestAlly, enemy.damage);
                        fireLaser(pos, allyPos, false, enemy.type === 'tank' ? 'heavy' : 'enemy');
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
                enemy.sabotageField = null;
                enemy.isWaveUnit = true;
            } else {
                const targetPos = enemy.sabotageNode.pos;
                const distToNode = Math.hypot(pos.x - targetPos.x, pos.z - targetPos.z);

                if (distToNode <= CAPTURE_RADIUS - 0.5) {
                    enemy.velocity.set(0, 0, 0);
                    enemy.mesh.rotation.y += delta * 1.5;
                } else {
                    // Точка видна — идём прямо; закрыта стенами — по полю потока своего приказа
                    if (hasLineOfSight(pos.x, pos.z, targetPos.x, targetPos.z)) {
                        _v1.subVectors(targetPos, pos);
                        _v1.y = 0;
                        _v1.normalize();
                    } else {
                        let followsField = false;
                        const field = enemy.sabotageField;
                        if (field && field.width === GRID_SIZE && field.flowX.length === GRID_SIZE * GRID_SIZE) {
                            const cg = worldToGrid(pos.x, pos.z);
                            if (cg.col >= 0 && cg.col < GRID_SIZE && cg.row >= 0 && cg.row < GRID_SIZE) {
                                const ci = cg.row * GRID_SIZE + cg.col;
                                if (field.flowX[ci] !== 0 || field.flowY[ci] !== 0) {
                                    _v1.set(field.flowX[ci], 0, field.flowY[ci]);
                                    followsField = true;
                                }
                            }
                        }
                        if (!followsField) findBypassDirection(pos.x, pos.z, targetPos.x, targetPos.z, _v1);
                    }
                    const marchSpeed = enemy.speed * marchMult;
                    pos.addScaledVector(_v1, marchSpeed * delta);
                    enemy.velocity.copy(_v1).multiplyScalar(marchSpeed);
                    enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
                }
            }
        } else if (enemy.isWaveUnit && playerHQ && playerHQ.mesh && playerHQ.hp > 0) {
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
                    playerHQ.hp = Math.max(0, playerHQ.hp - getEnemyHQDamage(enemy));
                    fireLaser(pos, hqPos, false);
                    if (currentTime - lastHQAlertTime > 8.0 && typeof showTacticalAlert === 'function') {
                        lastHQAlertTime = currentTime;
                        showTacticalAlert(typeof t === 'function' ? t('ALERT_HQ_ATTACK') : '⚠️ ВРАГ АТАКУЕТ НАШ ШТАБ!', true);
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

                const marchSpeed = enemy.speed * marchMult;
                pos.addScaledVector(_v1, marchSpeed * delta);
                enemy.velocity.copy(_v1).multiplyScalar(marchSpeed);
                enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
            }
        } else {
            // Патрулирование обычной картой
            if (enemy.state === States.IDLE) {
                enemy.velocity.set(0, 0, 0);
                enemy.roamCooldown -= delta;

                if (enemy.roamCooldown <= 0) {
                    const rnd = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.random() : Math.random();
                    if (rnd < 0.35 && resourceNodes.length > 0) {
                        const nodeIdx = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.int(0, resourceNodes.length - 1) : Math.floor(Math.random() * resourceNodes.length);
                        const targetNode = resourceNodes[nodeIdx];
                        // Точка патруля — на кольце захвата вокруг кристалла, а не внутри него: цель в ±1 от центра
                        // лежала в самом кристалле (радиус 1.35), и патрульный толкался в него до истечения таймера
                        const roamAngle = ((typeof rtsPRNG !== 'undefined') ? rtsPRNG.random() : Math.random()) * Math.PI * 2;
                        const maxRoamR = Math.max(2.5, (typeof CAPTURE_RADIUS !== 'undefined' ? CAPTURE_RADIUS : 2.8) - 0.4);
                        const roamRadius = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.range(2.1, maxRoamR) : 2.1 + Math.random() * (maxRoamR - 2.1);
                        if (!enemy.roamTarget) enemy.roamTarget = new THREE.Vector3();
                        enemy.roamTarget.set(targetNode.pos.x + Math.cos(roamAngle) * roamRadius, 0.75, targetNode.pos.z + Math.sin(roamAngle) * roamRadius);
                    } else {
                        let col = 1, row = 1;
                        for (let attempt = 0; attempt < 50; attempt++) {
                            const rc = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.int(1, GRID_SIZE - 2) : Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
                            const rr = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.int(1, GRID_SIZE - 2) : Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
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
                    // Запас времени на переход: точка за стеной может оказаться недостижимой по прямой
                    enemy.roamTimeLeft = 4 + pos.distanceTo(enemy.roamTarget) / Math.max(enemy.speed, 0.5) * 1.5;
                }
            } else if (enemy.state === States.MOVE && enemy.roamTarget) {
                const distToRoam = pos.distanceTo(enemy.roamTarget);
                const stopThreshold = Math.max(0.4, enemy.radius * 0.9);
                enemy.roamTimeLeft = (enemy.roamTimeLeft || 0) - delta;
                if (distToRoam <= stopThreshold || enemy.roamTimeLeft <= 0) {
                    enemy.state = States.IDLE;
                    enemy.roamTarget = null;
                    enemy.roamCooldown = (typeof rtsPRNG !== 'undefined') ? rtsPRNG.range(2, 6) : (Math.random() * 4 + 2);
                    enemy.velocity.set(0, 0, 0);
                } else {
                    if (hasLineOfSight(pos.x, pos.z, enemy.roamTarget.x, enemy.roamTarget.z)) {
                        _v1.subVectors(enemy.roamTarget, pos);
                        _v1.y = 0;
                        _v1.normalize();
                    } else {
                        findBypassDirection(pos.x, pos.z, enemy.roamTarget.x, enemy.roamTarget.z, _v1);
                    }
                    let spd = enemy.speed;
                    if (distToRoam < 1.5) spd *= Math.max(0.25, distToRoam / 1.5);
                    pos.addScaledVector(_v1, spd * delta);
                    enemy.velocity.copy(_v1).multiplyScalar(spd);
                    enemy.mesh.rotation.y = THREE.MathUtils.lerpAngle(enemy.mesh.rotation.y, Math.atan2(-_v1.z, _v1.x), 10 * delta);
                }
            } else {
                // Патрульный гнался за союзником (цель патруля сброшена) и потерял его: раньше он навсегда
                // застывал в MOVE без цели. Возвращаем в патруль.
                if (typeof recoverIdleEnemyPatrol === 'function') {
                    recoverIdleEnemyPatrol(enemy);
                } else {
                    enemy.state = States.IDLE;
                    enemy.velocity.set(0, 0, 0);
                    if (!(enemy.roamCooldown > 0)) enemy.roamCooldown = 1.0;
                }
            }
        }

        if (enemy.mesh.userData) {
            enemy.mesh.userData.velocity.copy(enemy.velocity);
        }
    }
}
