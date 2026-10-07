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
            energy += (ENERGY_INCOME_PER_SEC + playerNodesCount * NODE_ENERGY_BONUS);
            updateResourceUI();
        }

        // 3. Таймер волн врагов
        waveTimer -= delta;
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

        // 6. FSM логика союзных юнитов игрока
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            if (unit.hp <= 0) continue;
            const pos = unit.mesh.position;

            updateHealthBar(unit.healthBar, unit.hp, unit.maxHp);

            let nearestEnemy = null;
            let minDist = unit.visionRange;

            for (let j = 0; j < enemies.length; j++) {
                const enemy = enemies[j];
                if (enemy.hp <= 0) continue;
                const d = pos.distanceTo(enemy.mesh.position);
                if (d < minDist) { minDist = d; nearestEnemy = enemy; }
            }

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

                            if (distance < 4.0 || (flowVector.x === 0 && flowVector.y === 0)) {
                                _v2.copy(_v1);
                            } else {
                                _v3.set(flowVector.x, 0, flowVector.y);
                                _v2.lerpVectors(_v3, _v1, 0.25).normalize();
                            }

                            const step = Math.min(unit.speed * delta, distance);
                            pos.addScaledVector(_v2, step);
                            unit.velocity.copy(_v2).multiplyScalar(unit.speed);
                            unit.mesh.rotation.y = THREE.MathUtils.lerp(unit.mesh.rotation.y, Math.atan2(-_v2.z, _v2.x), 10 * delta);
                        }
                    }
                    break;

                case States.CHASE:
                    if (!unit.targetEnemy || unit.targetEnemy.hp <= 0) {
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
                        _v1.subVectors(enemyPos, pos);
                        _v1.y = 0;
                        _v1.normalize();
                        pos.addScaledVector(_v1, unit.speed * delta);
                        unit.velocity.copy(_v1).multiplyScalar(unit.speed);
                        unit.mesh.rotation.y = Math.atan2(-_v1.z, _v1.x);
                    }
                    break;

                case States.ATTACK:
                    unit.velocity.set(0, 0, 0);
                    if (!unit.targetEnemy || unit.targetEnemy.hp <= 0) {
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
                        unit.mesh.rotation.y = Math.atan2(-_v1.z, _v1.x);

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
                updateResourceUI();
                if (isBoss) {
                    showTacticalAlert('🏆 БОСС «ЛЕВИАФАН» УНИЧТОЖЕН! (+100⚡)', false);
                }
            }
        }

        // Проверка победы или поражения
        checkGameOverConditions();

        // 10. Скалярная 2D физика расталкивания (Unit-Unit & Unit-Wall)
        const numAllies = units.length;
        const numEnemies = enemies.length;
        const totalUnits = numAllies + numEnemies;

        for (let i = 0; i < totalUnits; i++) {
            const u1 = i < numAllies ? units[i] : enemies[i - numAllies];
            if (u1.hp <= 0) continue;
            const p1 = u1.mesh.position;

            for (let j = i + 1; j < totalUnits; j++) {
                const u2 = j < numAllies ? units[j] : enemies[j - numAllies];
                if (u2.hp <= 0) continue;
                const p2 = u2.mesh.position;

                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                const distSq = dx * dx + dz * dz;
                const minDist = u1.radius + u2.radius;

                if (distSq < minDist * minDist) {
                    let dist = Math.sqrt(distSq);
                    let nx, nz;
                    if (dist > 0.0001) {
                        nx = dx / dist;
                        nz = dz / dist;
                    } else {
                        nx = 1; nz = 0;
                        dist = 0.0001;
                    }
                    const overlap = (minDist - dist) * 0.5;
                    p1.x -= nx * overlap;
                    p1.z -= nz * overlap;
                    p2.x += nx * overlap;
                    p2.z += nz * overlap;
                }
            }
        }

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

    // 12. Финальный рендер кадра
    renderer.render(scene, camera);
}

// Старт игрового цикла
animate();
