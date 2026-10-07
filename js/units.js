// =============================================================================
// js/units.js — Управление юнитами, спавн, визуальные анимации и поиск свободных клеток
// =============================================================================

const units = [];
const enemies = [];

// Проверка занятости точки другими юнитами
function isPositionOccupied(x, z, minDist = 0.9) {
    const minSq = minDist * minDist;
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.hp > 0) {
            const dx = u.mesh.position.x - x;
            const dz = u.mesh.position.z - z;
            if (dx * dx + dz * dz < minSq) return true;
        }
    }
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.hp > 0) {
            const dx = e.mesh.position.x - x;
            const dz = e.mesh.position.z - z;
            if (dx * dx + dz * dz < minSq) return true;
        }
    }
    return false;
}

// Поиск ближайшей свободной клетки на карте
function findFreeCellNear(col, row) {
    for (let radius = 0; radius < GRID_SIZE; radius++) {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
                const r = row + dr, c = col + dc;
                if (r <= 0 || r >= GRID_SIZE - 1 || c <= 0 || c >= GRID_SIZE - 1) continue;
                if (grid[r][c] === 1) continue;
                const worldPos = gridToWorld(c, r);
                if (!isPositionOccupied(worldPos.x, worldPos.z, 0.9)) {
                    return { col: c, row: r };
                }
            }
        }
    }
    return { col, row };
}

// Создание союзного юнита
function createUnit(col, row, type = 'standard') {
    const stats = DRONE_TYPES[type];
    const mesh = createDroneUnit(true);
    mesh.scale.setScalar(stats.scale);
    const pos = gridToWorld(col, row);
    mesh.position.set(pos.x, 0.75, pos.z);
    scene.add(mesh);

    const hpBar = attachHealthBar(mesh, true, 0.7 * stats.scale);

    units.push({
        mesh: mesh,
        type: type,
        selected: false,
        state: States.IDLE,
        personalTarget: null,
        targetEnemy: null,
        hp: stats.hp,
        maxHp: stats.hp,
        speed: stats.speed,
        radius: stats.radius,
        visionRange: stats.visionRange,
        attackRange: stats.attackRange,
        attackCooldown: stats.attackCooldown,
        damage: stats.damage,
        lastAttackTime: 0,
        healthBar: hpBar,
        velocity: new THREE.Vector3(),
        // Тактические способности
        abilityActive: false,
        abilityTimer: 0,
        lastAbilityTime: -99,
        isSieged: false,
        lastSiegeSwitch: -99,
        shield: 0,
        maxShield: 50,
        shieldTimer: 0
    });
}

// Создание вражеского юнита
function createEnemy(x, z, type = 'standard', isWaveUnit = false, sabotageNode = null) {
    const stats = ENEMY_TYPES[type] || ENEMY_TYPES.standard;
    const isBoss = type === 'boss';

    const mesh = isBoss ? createBossUnit() : createDroneUnit(false);
    mesh.scale.setScalar(stats.scale);
    mesh.position.set(x, 0.75, z);
    scene.add(mesh);

    const hpBar = isBoss ? attachBossHealthBar(mesh) : attachHealthBar(mesh, false, 0.7 * stats.scale);

    enemies.push({
        mesh: mesh,
        type: type,
        state: States.IDLE,
        hp: stats.hp,
        maxHp: stats.hp,
        shield: stats.shield || 0,
        maxShield: stats.maxShield || 0,
        shieldMesh: isBoss ? mesh.userData.shieldMesh : null,
        speed: stats.speed,
        radius: stats.radius,
        visionRange: stats.visionRange,
        attackRange: stats.attackRange,
        attackCooldown: stats.attackCooldown,
        damage: stats.damage,
        reward: stats.reward,
        lastAttackTime: 0,
        targetAlly: null,
        healthBar: hpBar,
        velocity: new THREE.Vector3(),
        roamTarget: null,
        roamCooldown: Math.random() * 2,
        isWaveUnit: isWaveUnit,
        sabotageNode: sabotageNode
    });
}

// Анимация визуальных эффектов юнитов (пропеллеры, парение, сияние)
function updateUnitVisuals(unit, currentTime, delta) {
    const data = unit.mesh.userData;
    if (!data) return;

    if (data.isBoss) {
        // Анимация Босса-Левиафана
        const offset = data.hoverOffset || 0;
        unit.mesh.position.y = 1.1 + Math.sin(currentTime * 2.0 + offset) * 0.08;

        if (data.shieldMesh && data.shieldMesh.visible) {
            data.shieldMesh.rotation.y += delta * 0.5;
            if (data.shieldMesh.material.opacity > 0.35) {
                data.shieldMesh.material.opacity = THREE.MathUtils.lerp(data.shieldMesh.material.opacity, 0.35, 4 * delta);
            }
        }
        if (data.coreMesh) {
            const coreScale = 1.0 + Math.sin(currentTime * 8) * 0.15;
            data.coreMesh.scale.setScalar(coreScale);
        }
    } else {
        // Обычные дроны
        if (data.rotors) {
            for (let i = 0; i < data.rotors.length; i++) {
                data.rotors[i].rotation.y += (i % 2 === 0 ? 0.52 : -0.52);
            }
        }

        const offset = data.hoverOffset || 0;
        unit.mesh.position.y = 0.75 + Math.sin(currentTime * 3.5 + offset) * 0.04;

        if (data.enginePlume) {
            const speed = unit.velocity ? unit.velocity.length() : 0;
            const scaleStretch = 1.0 + speed * 2.5;
            const flicker = Math.sin(currentTime * 25) * 0.15;
            data.enginePlume.scale.set(1, scaleStretch + flicker, 1);
        }
    }

    if (unit.velocity) {
        unit.mesh.rotation.z = THREE.MathUtils.lerp(unit.mesh.rotation.z, -unit.velocity.x * 0.45, 0.1);
        unit.mesh.rotation.x = THREE.MathUtils.lerp(unit.mesh.rotation.x, unit.velocity.z * 0.45, 0.1);
    }

    if (data.selectionRing && data.selectionRing.visible) {
        data.selectionRing.rotation.z = currentTime * 1.5;
    }

    // Тактические визуальные эффекты активных способностей
    if (unit.type === 'scout') {
        if (unit.abilityActive) {
            unit.abilityTimer -= delta;
            if (data.enginePlume) {
                data.enginePlume.scale.set(2.2, 4.2, 2.2);
            }
            if (typeof spawnTrailParticle === 'function') {
                spawnTrailParticle(unit.mesh.position.x, unit.mesh.position.y + 0.12, unit.mesh.position.z);
            }
            if (unit.abilityTimer <= 0) {
                unit.abilityActive = false;
                unit.speed = DRONE_TYPES.scout.speed;
            }
        }
    } else if (unit.type === 'tank') {
        if (data.siegeMesh) {
            data.siegeMesh.visible = !!unit.isSieged;
            if (unit.isSieged) {
                data.siegeMesh.rotation.z = currentTime * 2.2;
                unit.mesh.position.y = 0.55; // Осадка на грунт
            }
        }
    } else if (unit.type === 'standard') {
        if (unit.shield > 0) {
            unit.shieldTimer -= delta;
            if (unit.shieldTimer <= 0) {
                unit.shield = 0;
            }
            if (data.shieldMesh) {
                data.shieldMesh.visible = true;
                data.shieldMesh.rotation.y += delta * 1.5;
            }
        } else if (data.shieldMesh) {
            data.shieldMesh.visible = false;
        }
    }
}

// --- ТАКТИЧЕСКИЕ СПОСОБНОСТИ ЮНИТОВ ---

// 1. Форсаж Разведчика (+80% к скорости на 3 сек, кулдаун 10 сек)
function activateScoutOverdrive(unit, currentTime) {
    if (unit.type !== 'scout' || unit.hp <= 0) return false;
    const cd = 10.0;
    if (currentTime - unit.lastAbilityTime < cd) return false;
    unit.lastAbilityTime = currentTime;
    unit.abilityActive = true;
    unit.abilityTimer = 3.0;
    unit.speed = DRONE_TYPES.scout.speed * 1.8;
    return true;
}

// 2. Осадный режим Танка (скорость 0, дальность огня x2, сплэш-урон, кулдаун переключения 2.5 сек)
function toggleTankSiege(unit, currentTime) {
    if (unit.type !== 'tank' || unit.hp <= 0) return false;
    const cd = 2.5;
    if (currentTime - unit.lastSiegeSwitch < cd) return false;
    unit.lastSiegeSwitch = currentTime;
    unit.isSieged = !unit.isSieged;
    if (unit.isSieged) {
        unit.speed = 0;
        unit.velocity.set(0, 0, 0);
        unit.personalTarget = null;
        unit.state = States.IDLE;
        unit.attackRange = DRONE_TYPES.tank.attackRange * 2.0;
    } else {
        unit.speed = DRONE_TYPES.tank.speed;
        unit.attackRange = DRONE_TYPES.tank.attackRange;
    }
    return true;
}

// 3. Энергетический щит Дрона (+50 HP поглощения на 6 сек, кулдаун 12 сек)
function activateDroneShield(unit, currentTime) {
    if (unit.type !== 'standard' || unit.hp <= 0) return false;
    const cd = 12.0;
    if (currentTime - unit.lastAbilityTime < cd) return false;
    unit.lastAbilityTime = currentTime;
    unit.shield = 50;
    unit.maxShield = 50;
    unit.shieldTimer = 6.0;
    if (unit.mesh.userData && unit.mesh.userData.shieldMesh) {
        unit.mesh.userData.shieldMesh.visible = true;
    }
    return true;
}

// Групповая активация способности для выделенных юнитов игрока
function triggerAbilityForSelected(abilityType) {
    const curTime = (typeof clock !== 'undefined') ? clock.elapsedTime : performance.now() / 1000;
    let activated = 0;
    let siegedOn = 0;
    let siegedOff = 0;

    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.selected || u.hp <= 0) continue;
        if (abilityType === 'overdrive' && u.type === 'scout') {
            if (activateScoutOverdrive(u, curTime)) activated++;
        } else if (abilityType === 'siege' && u.type === 'tank') {
            if (toggleTankSiege(u, curTime)) {
                activated++;
                if (u.isSieged) siegedOn++;
                else siegedOff++;
            }
        } else if (abilityType === 'shield' && u.type === 'standard') {
            if (activateDroneShield(u, curTime)) activated++;
        }
    }

    if (typeof showTacticalAlert === 'function') {
        if (abilityType === 'overdrive' && activated > 0) {
            showTacticalAlert(`⚡ ФОРСАЖ: ${activated} Разведч. ускорились (+80%)!`, false);
        } else if (abilityType === 'siege' && activated > 0) {
            if (siegedOn > 0 && siegedOff === 0) showTacticalAlert(`⚓ ОСАДА ВКЛЮЧЕНА (${siegedOn} Танков зафиксировано)!`, false);
            else if (siegedOff > 0 && siegedOn === 0) showTacticalAlert(`🚜 МОБИЛЬНЫЙ РЕЖИМ (${siegedOff} Танков снялись с якоря)!`, false);
            else showTacticalAlert(`⚓ РЕЖИМ ОСАДЫ ПЕРЕКЛЮЧЁН (${activated} Танков)!`, false);
        } else if (abilityType === 'shield' && activated > 0) {
            showTacticalAlert(`🛡️ ЭНЕРГОЩИТ активирован (${activated} Дронов)!`, false);
        }
    }
    if (typeof updateAbilityUI === 'function') updateAbilityUI(curTime);
}

// Инициализация стартовых юнитов
function initStartingUnits() {
    createUnit(2, 2); createUnit(2, 3); createUnit(3, 2); createUnit(3, 3); createUnit(4, 2);
    createEnemy(12, 12, 'standard'); createEnemy(14, 12, 'scout'); createEnemy(13, 14, 'standard');
}
