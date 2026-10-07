// =============================================================================
// js/models.js — 3D модели юнитов, флагмана, штабов и общие ресурсы Three.js
// =============================================================================

// Геометрии стандартных дронов
const droneBodyGeo = new THREE.BoxGeometry(0.5, 0.12, 0.5);
const droneEyeGeo = new THREE.BoxGeometry(0.18, 0.06, 0.06);
const droneThrusterGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8);
const dronePlumeGeo = new THREE.ConeGeometry(0.06, 0.3, 4);
dronePlumeGeo.translate(0, -0.15, 0);
const droneArmGeo = new THREE.BoxGeometry(0.06, 0.03, 0.8);
const droneMotorGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8);
const droneBladeGeo = new THREE.BoxGeometry(0.3, 0.01, 0.02);
const droneSelectionRingGeo = new THREE.RingGeometry(0.5, 0.56, 16);
droneSelectionRingGeo.rotateX(-Math.PI / 2);

// Геометрии Босса-Левиафана
const bossHullGeo = new THREE.BoxGeometry(1.6, 0.45, 2.2);
const bossWingGeo = new THREE.BoxGeometry(0.5, 0.3, 1.4);
const bossBridgeGeo = new THREE.CylinderGeometry(0.35, 0.5, 0.4, 6);
const bossCoreGeo = new THREE.SphereGeometry(0.35, 12, 12);
const bossCannonGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8);
bossCannonGeo.rotateX(Math.PI / 2);
const bossShieldGeo = new THREE.SphereGeometry(2.3, 22, 18);

// Материалы дронов
const allyBodyMat = new THREE.MeshStandardMaterial({
    color: 0x0077ff, metalness: 0.8, roughness: 0.15, emissive: 0x00ffcc, emissiveIntensity: 0.25
});
const enemyBodyMat = new THREE.MeshStandardMaterial({
    color: 0xff3333, metalness: 0.8, roughness: 0.15, emissive: 0xff3333, emissiveIntensity: 0.25
});
const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.8, roughness: 0.2 });
const allyRotorMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, metalness: 0.2, roughness: 0.5 });
const enemyRotorMat = new THREE.MeshStandardMaterial({ color: 0xff3333, metalness: 0.2, roughness: 0.5 });
const allyLedMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
const enemyLedMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
const allyPlumeMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const enemyPlumeMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const selectionRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });

// Материалы Босса-Левиафана
const bossHullMat = new THREE.MeshStandardMaterial({
    color: 0x180914, metalness: 0.85, roughness: 0.25, emissive: 0x660018, emissiveIntensity: 0.4
});
const bossCoreMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
const bossShieldMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.35, wireframe: true, depthWrite: false
});

// Создание 3D модели дрона
function createDroneUnit(isAlly) {
    const droneGroup = new THREE.Group();
    const bodyMat = isAlly ? allyBodyMat : enemyBodyMat;
    const rotorMat = isAlly ? allyRotorMat : enemyRotorMat;
    const ledMat = isAlly ? allyLedMat : enemyLedMat;
    const plumeMat = isAlly ? allyPlumeMat : enemyPlumeMat;

    const body = new THREE.Mesh(droneBodyGeo, bodyMat);
    body.position.y = 0.15;
    body.castShadow = true;
    body.receiveShadow = true;
    droneGroup.add(body);

    const eye = new THREE.Mesh(droneEyeGeo, ledMat);
    eye.position.set(0, 0.15, 0.26);
    droneGroup.add(eye);

    const thruster = new THREE.Mesh(droneThrusterGeo, frameMat);
    thruster.position.set(0, 0.12, -0.25);
    thruster.rotation.x = Math.PI / 2;
    droneGroup.add(thruster);

    const plume = new THREE.Mesh(dronePlumeGeo, plumeMat);
    plume.position.set(0, 0.12, -0.31);
    plume.rotation.x = -Math.PI / 2;
    droneGroup.add(plume);

    const arm1 = new THREE.Mesh(droneArmGeo, frameMat);
    arm1.position.y = 0.15;
    arm1.rotation.y = Math.PI / 4;
    droneGroup.add(arm1);

    const arm2 = new THREE.Mesh(droneArmGeo, frameMat);
    arm2.position.y = 0.15;
    arm2.rotation.y = -Math.PI / 4;
    droneGroup.add(arm2);

    const rotors = [];
    const distance = 0.28;
    const rotorPositions = [
        { x: distance, z: distance }, { x: -distance, z: distance },
        { x: distance, z: -distance }, { x: -distance, z: -distance }
    ];

    for (let i = 0; i < 4; i++) {
        const pos = rotorPositions[i];
        const motor = new THREE.Mesh(droneMotorGeo, frameMat);
        motor.position.set(pos.x, 0.18, pos.z);
        droneGroup.add(motor);

        const blade = new THREE.Mesh(droneBladeGeo, rotorMat);
        blade.position.set(pos.x, 0.21, pos.z);
        blade.rotation.y = Math.random() * Math.PI;
        droneGroup.add(blade);
        rotors.push(blade);
    }

    const selectionRing = new THREE.Mesh(droneSelectionRingGeo, selectionRingMat);
    selectionRing.position.y = -0.65;
    selectionRing.visible = false;
    droneGroup.add(selectionRing);

    droneGroup.userData = {
        rotors: rotors,
        hoverOffset: Math.random() * 100,
        velocity: new THREE.Vector3(0, 0, 0),
        enginePlume: plume,
        selectionRing: selectionRing
    };

    return droneGroup;
}

// Генератор 3D модели Босса-Левиафана
function createBossUnit() {
    const bossGroup = new THREE.Group();

    // Тяжелый корпус
    const hull = new THREE.Mesh(bossHullGeo, bossHullMat);
    hull.position.y = 0.35;
    hull.castShadow = true;
    hull.receiveShadow = true;
    bossGroup.add(hull);

    // Мостик
    const bridge = new THREE.Mesh(bossBridgeGeo, frameMat);
    bridge.position.set(0, 0.65, 0.25);
    bossGroup.add(bridge);

    // Реактор
    const core = new THREE.Mesh(bossCoreGeo, bossCoreMat);
    core.position.set(0, 0.5, -0.4);
    bossGroup.add(core);

    // Орудийные крылья
    const leftWing = new THREE.Mesh(bossWingGeo, frameMat);
    leftWing.position.set(-1.0, 0.3, 0);
    bossGroup.add(leftWing);

    const rightWing = new THREE.Mesh(bossWingGeo, frameMat);
    rightWing.position.set(1.0, 0.3, 0);
    bossGroup.add(rightWing);

    // Сдвоенные орудия
    const leftCannon = new THREE.Mesh(bossCannonGeo, frameMat);
    leftCannon.position.set(-1.0, 0.3, 0.8);
    bossGroup.add(leftCannon);

    const rightCannon = new THREE.Mesh(bossCannonGeo, frameMat);
    rightCannon.position.set(1.0, 0.3, 0.8);
    bossGroup.add(rightCannon);

    // 4 сопла двигателей
    const exhaustPositions = [
        { x: -0.5, z: -1.15 }, { x: 0.5, z: -1.15 },
        { x: -1.0, z: -0.75 }, { x: 1.0, z: -0.75 }
    ];
    exhaustPositions.forEach(pt => {
        const exhaust = new THREE.Mesh(droneThrusterGeo, frameMat);
        exhaust.position.set(pt.x, 0.3, pt.z);
        exhaust.rotation.x = Math.PI / 2;
        bossGroup.add(exhaust);

        const plume = new THREE.Mesh(dronePlumeGeo, enemyPlumeMat);
        plume.position.set(pt.x, 0.3, pt.z - 0.16);
        plume.rotation.x = -Math.PI / 2;
        plume.scale.set(1.4, 1.8, 1.4);
        bossGroup.add(plume);
    });

    // Энергетический купол силового поля
    const shieldMesh = new THREE.Mesh(bossShieldGeo, bossShieldMat.clone());
    shieldMesh.position.y = 0.35;
    bossGroup.add(shieldMesh);

    bossGroup.userData = {
        isBoss: true,
        shieldMesh: shieldMesh,
        coreMesh: core,
        hoverOffset: 0,
        velocity: new THREE.Vector3()
    };

    return bossGroup;
}

// Постройка штабов команд (HQ)
function createHQ(col, row, isPlayer) {
    const group = new THREE.Group();
    const factionColor = isPlayer ? 0x0077ff : 0xff3333;
    const glowColor = isPlayer ? 0x00ffcc : 0xff6644;

    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1a1d24, metalness: 0.7, roughness: 0.25,
        emissive: factionColor, emissiveIntensity: 0.15
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: factionColor, metalness: 0.6, roughness: 0.3,
        emissive: glowColor, emissiveIntensity: 0.4
    });
    const beaconMat = new THREE.MeshBasicMaterial({ color: glowColor });

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 3.2), baseMat);
    base.position.y = 0.8;
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 8), accentMat);
    tower.position.y = 2.8;
    tower.castShadow = true;
    group.add(tower);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), beaconMat);
    beacon.position.y = 4.4;
    group.add(beacon);

    const light = new THREE.PointLight(glowColor, 2.5, 9.0);
    light.position.y = 3.2;
    group.add(light);

    const pos = gridToWorld(col, row);
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);

    const hpBar = attachHealthBar(group, isPlayer, 5.4, 3.0);

    return {
        mesh: group,
        hp: 500,
        maxHp: 500,
        radius: 1.8,
        healthBar: hpBar
    };
}

const playerHQ = createHQ(HQ_COL, HQ_ROW, true);
const enemyHQ = createHQ(ENEMY_HQ_COL, ENEMY_HQ_ROW, false);
