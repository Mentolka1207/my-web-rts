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
// - js/effects.js     — Пул лазеров, вспышек, взрывов и следов попаданий
// - js/units.js       — Юниты, спавн, физика анимаций и проверка позиций
// - js/resources.js   — Кристаллы сбора ресурсов и логика захвата
// - js/economy.js     — Энергия, доходы и производство
// - js/ai.js          — ИИ врагов, составные волны и тактические контратаки
// - js/minimap.js     — Миникарта с кэшированием и масштабируемыми маркерами
// - js/input.js       — Управление: выбор, приказы, MMB панорама и сенсор
// - js/ui.js          — Меню, оповещения и экраны победы/поражения
// =============================================================================

// Создание начальных отрядов
initStartingUnits();

// Часы анимации
const clock = new THREE.Clock();

// Главный игровой цикл (Zero-allocation RAF loop)
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const currentTime = clock.elapsedTime;

    // Обновление позиции камеры по WASD / Стрелкам
    updateCamera(delta);

    if (gameStarted && !gameOver) {
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
        spatialGrid.clear();
        for (let i = 0; i < units.length; i++) {
            if (units[i].hp > 0) spatialGrid.insert(units[i], false);
        }
        for (let i = 0; i < enemies.length; i++) {
            if (enemies[i].hp > 0) spatialGrid.insert(enemies[i], true);
        }

        // 6. FSM логика союзных юнитов игрока
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
                        if (distToTarget < 0.15) {
                            unit.state = States.IDLE;
                            unit.velocity.set(0, 0, 0);
                            break;
                        }

                        const gridPos = worldToGrid(pos.x, pos.z);
                        if (gridPos.col >= 0 && gridPos.col < GRID_SIZE && gridPos.row >= 0 && gridPos.row < GRID_SIZE) {
                            if (grid[gridPos.row][gridPos.col] === 1) {
                                _v1.subVectors(unit.personalTarget, pos);
                                _v1.y = 0;
                                if (_v1.lengthSq() > 0.001) _v1.normalize();
                                else _v1.set(1, 0, 0);
                                pos.addScaledVector(_v1, 0.4);
                                unit.velocity.copy(_v1).multiplyScalar(unit.speed);
                                break;
                            }

                            const flowVector = flowFieldGen.flowField[gridPos.row][gridPos.col];
                            _v1.subVectors(unit.personalTarget, pos);
                            _v1.y = 0;
                            const distance = _v1.length();
                            _v1.normalize();

                            const hasLOS = hasLineOfSight(pos.x, pos.z, unit.personalTarget.x, unit.personalTarget.z);
                            if ((distance < 4.0 && hasLOS) || (flowVector.x === 0 && flowVector.y === 0)) {
                                _v2.copy(_v1);
                            } else {
                                _v3.set(flowVector.x, 0, flowVector.y);
                                _v2.lerpVectors(_v3, _v1, 0.25).normalize();
                            }

                            const step = Math.min(unit.speed * delta, distance);
                            pos.addScaledVector(_v2, step);
                            unit.velocity.copy(_v2).multiplyScalar(unit.speed);
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

                            fireLaser(pos, attEnemyPos, true);

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
            if (units[i].hp <= 0) {
                spawnExplosion(units[i].mesh.position, 10);
                spawnScorch(units[i].mesh.position);
                scene.remove(units[i].mesh);
                units.splice(i, 1);
            }
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].hp <= 0) {
                const e = enemies[i];
                const isBoss = e.type === 'boss';
                spawnExplosion(e.mesh.position, isBoss ? 36 : 10);
                spawnScorch(e.mesh.position);
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

        // Проверка победы или поражения
        checkGameOverConditions();

        // 10. Высокопроизводительное пространственное расталкивание юнитов O(n) (Spatial Grid)
        spatialGrid.resolveSeparation();

        const numAllies = units.length;
        const numEnemies = enemies.length;
        const totalUnits = numAllies + numEnemies;

        // Столкновения со стенами
        for (let i = 0; i < totalUnits; i++) {
            const u = i < numAllies ? units[i] : enemies[i - numAllies];
            if (u.hp <= 0) continue;
            const pos = u.mesh.position;
            const gridPos = worldToGrid(pos.x, pos.z);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nc = gridPos.col + dx;
                    const nr = gridPos.row + dy;
                    if (nc >= 0 && nc < GRID_SIZE && nr >= 0 && nr < GRID_SIZE && grid[nr][nc] === 1) {
                        const isHQCell = (nr === HQ_ROW && nc === HQ_COL) || (nr === ENEMY_HQ_ROW && nc === ENEMY_HQ_COL);
                        const wallPos = gridToWorld(nc, nr);
                        const diffX = pos.x - wallPos.x;
                        const diffZ = pos.z - wallPos.z;
                        const distSq = diffX * diffX + diffZ * diffZ;
                        const wallRadius = isHQCell ? 1.8 : 1.1;
                        const minDist = wallRadius + u.radius;

                        if (distSq < minDist * minDist) {
                            let dist = Math.sqrt(distSq);
                            let nx, nz;
                            if (dist > 0.0001) {
                                nx = diffX / dist;
                                nz = diffZ / dist;
                            } else {
                                nx = 1; nz = 0;
                                dist = 0.0001;
                            }
                            const push = (minDist - dist) * 0.8;
                            pos.x += nx * push;
                            pos.z += nz * push;
                        }
                    }
                }
            }
        }
    }

    // 11. Обновление визуальных эффектов и миникарты
    updateVFX(delta);
    updateExplosions(delta);
    updateMinimap();

    // 12. Обновление Debug-Overlay и панели способностей
    if (typeof updateDebugOverlay === 'function') {
        updateDebugOverlay(delta);
    }
    if (typeof updateAbilityUI === 'function') {
        updateAbilityUI(currentTime);
    }

    // 13. Финальный рендер кадра
    renderer.render(scene, camera);
    
}

// Старт игрового цикла
animate();
