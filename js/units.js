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
        velocity: new THREE.Vector3()
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
}

// Инициализация стартовых юнитов
function initStartingUnits() {
    createUnit(2, 2); createUnit(2, 3); createUnit(3, 2); createUnit(3, 3); createUnit(4, 2);
    createEnemy(12, 12, 'standard'); createEnemy(14, 12, 'scout'); createEnemy(13, 14, 'standard');
}
