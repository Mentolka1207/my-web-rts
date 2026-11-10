// =============================================================================
// js/models.js — 3D модели юнитов (Дрон, Разведчик, Танк, Босс) и штабов (HQ)
// =============================================================================

// --- ОБЩИЕ ГЕОМЕТРИИ ---
// Стандартный дрон (Квадрокоптер)
const droneBodyGeo = new THREE.BoxGeometry(0.46, 0.14, 0.46);
const droneEyeGeo = new THREE.BoxGeometry(0.2, 0.06, 0.07);
const droneThrusterGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8);
const dronePlumeGeo = new THREE.ConeGeometry(0.06, 0.32, 4);
dronePlumeGeo.translate(0, -0.16, 0);
const droneArmGeo = new THREE.BoxGeometry(0.06, 0.03, 0.78);
const droneMotorGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8);
const droneBladeGeo = new THREE.BoxGeometry(0.28, 0.01, 0.02);
const droneGunGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6);
droneGunGeo.rotateX(Math.PI / 2);

// Скоростной разведчик (Перехватчик)
const scoutHullGeo = new THREE.BoxGeometry(0.26, 0.1, 0.65);
const scoutWingGeo = new THREE.BoxGeometry(0.72, 0.02, 0.24);
const scoutFinGeo = new THREE.BoxGeometry(0.02, 0.14, 0.16);
const scoutVisorGeo = new THREE.BoxGeometry(0.18, 0.05, 0.12);

// Тяжелый танк (Осадная платформа)
const tankHullGeo = new THREE.BoxGeometry(0.72, 0.22, 0.82);
const tankSkirtGeo = new THREE.BoxGeometry(0.14, 0.18, 0.9);
const tankTurretGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.12, 6);
const tankBarrelGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8);
tankBarrelGeo.rotateX(Math.PI / 2);
const tankMuzzleGeo = new THREE.BoxGeometry(0.1, 0.08, 0.12);
const tankHoverGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 8);

// Инициализация дефолтных вершинных цветов для совместимости с vertexColors: true
function ensureGeometryColors(geo, r = 1, g = 1, b = 1) {
    if (!geo.attributes.color) {
        const count = geo.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
}
ensureGeometryColors(droneBodyGeo);
ensureGeometryColors(scoutHullGeo);
ensureGeometryColors(tankHullGeo);

// Индикаторы и щиты
const droneSelectionRingGeo = new THREE.RingGeometry(0.5, 0.56, 20);
droneSelectionRingGeo.rotateX(-Math.PI / 2);
const droneShieldGeo = new THREE.SphereGeometry(0.65, 16, 12);
const siegeRingGeo = new THREE.RingGeometry(0.7, 0.85, 20);
siegeRingGeo.rotateX(-Math.PI / 2);

// Геометрии Босса-Левиафана
const bossHullGeo = new THREE.BoxGeometry(1.6, 0.45, 2.2);
const bossWingGeo = new THREE.BoxGeometry(0.5, 0.3, 1.4);
const bossBridgeGeo = new THREE.CylinderGeometry(0.35, 0.5, 0.4, 6);
const bossCoreGeo = new THREE.SphereGeometry(0.35, 12, 12);
const bossCannonGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8);
bossCannonGeo.rotateX(Math.PI / 2);
const bossShieldGeo = new THREE.SphereGeometry(2.3, 22, 18);

// Геометрии штаба (HQ)
const hqBaseGeo = new THREE.BoxGeometry(3.6, 1.2, 3.6);
const hqTowerGeo = new THREE.CylinderGeometry(1.1, 1.4, 2.2, 6);
const hqSpireGeo = new THREE.CylinderGeometry(0.2, 0.4, 1.4, 6);
const hqRadarGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.1, 8);
const hqHoloRingGeo = new THREE.RingGeometry(1.4, 1.6, 24);
hqHoloRingGeo.rotateX(-Math.PI / 2);
const hqPylonGeo = new THREE.BoxGeometry(0.4, 1.5, 0.4);
const hqBeaconTopGeo = new THREE.SphereGeometry(0.35, 12, 12);
const hqBeaconPylonGeo = new THREE.SphereGeometry(0.12, 8, 8);

// Предварительно объединенная геометрия статического каркаса HQ (шпиль + 4 пилона в 1 геометрии)
const hqStaticFrameGeo = (() => {
    const dummy = new THREE.Object3D();
    const items = [];
    dummy.position.set(0, 3.8, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    items.push({ geometry: hqSpireGeo, matrix: dummy.matrix.clone() });

    const pylonOffsets = [
        [-1.5, -1.5], [1.5, -1.5],
        [-1.5, 1.5], [1.5, 1.5]
    ];
    pylonOffsets.forEach(([px, pz]) => {
        dummy.position.set(px, 0.75, pz);
        dummy.updateMatrix();
        items.push({ geometry: hqPylonGeo, matrix: dummy.matrix.clone() });
    });
    return mergeBufferGeometries(items);
})();

// Предварительно объединенная геометрия статических маяков HQ (верхний маяк + 4 маяка пилонов)
const hqStaticBeaconsGeo = (() => {
    const dummy = new THREE.Object3D();
    const items = [];
    dummy.position.set(0, 4.8, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    items.push({ geometry: hqBeaconTopGeo, matrix: dummy.matrix.clone() });

    const pylonOffsets = [
        [-1.5, -1.5], [1.5, -1.5],
        [-1.5, 1.5], [1.5, 1.5]
    ];
    pylonOffsets.forEach(([px, pz]) => {
        dummy.position.set(px, 1.55, pz);
        dummy.updateMatrix();
        items.push({ geometry: hqBeaconPylonGeo, matrix: dummy.matrix.clone() });
    });
    return mergeBufferGeometries(items);
})();

// --- ПРОЦЕДУРНЫЕ PBR ТЕКСТУРЫ ДРОНОВ (Zero Assets) ---
function createDroneAlbedoTexture(isAlly) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Базовый титановый корпус фракции
    ctx.fillStyle = isAlly ? '#0d4a94' : '#941218';
    ctx.fillRect(0, 0, 256, 256);

    // Модульные бронепанели (4 квадранта)
    for (let py = 0; py < 2; py++) {
        for (let px = 0; px < 2; px++) {
            const ox = px * 128, oy = py * 128;
            ctx.fillStyle = isAlly
                ? (((px + py) % 2 === 0) ? '#1056aa' : '#0a3d7d')
                : (((px + py) % 2 === 0) ? '#aa161e' : '#7d0d12');
            ctx.fillRect(ox + 3, oy + 3, 122, 122);

            // Кромка панели
            ctx.strokeStyle = isAlly ? '#1c75e8' : '#e8232f';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(ox + 4, oy + 4, 120, 120);

            // Монтажные заклепки / болты на углах
            const bolts = [[10, 10], [118, 10], [10, 118], [118, 118]];
            for (let b = 0; b < bolts.length; b++) {
                ctx.fillStyle = '#111622';
                ctx.beginPath(); ctx.arc(ox + bolts[b][0], oy + bolts[b][1], 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#64748b';
                ctx.beginPath(); ctx.arc(ox + bolts[b][0], oy + bolts[b][1], 1.2, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    // Нано-композитная сетка
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 8; y < 256; y += 12) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
    }
    for (let x = 8; x < 256; x += 12) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
    }

    // Тактические кибер-полосы и шевроны
    ctx.strokeStyle = isAlly ? 'rgba(0, 255, 204, 0.85)' : 'rgba(255, 68, 68, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 128); ctx.lineTo(128, 64); ctx.lineTo(224, 128);
    ctx.stroke();

    ctx.fillStyle = isAlly ? '#00ffcc' : '#ff4444';
    ctx.beginPath();
    ctx.arc(128, 64, 4, 0, Math.PI * 2); ctx.fill();

    // Разделительные швы между бронелистами
    ctx.strokeStyle = '#05070d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.lineTo(256, 128);
    ctx.moveTo(128, 0); ctx.lineTo(128, 256);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function createDroneBumpTexture() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.lineTo(256, 128);
    ctx.moveTo(128, 0); ctx.lineTo(128, 256);
    ctx.stroke();

    ctx.strokeStyle = '#383838';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 120, 120);
    ctx.strokeRect(132, 4, 120, 120);
    ctx.strokeRect(4, 132, 120, 120);
    ctx.strokeRect(132, 132, 120, 120);

    const bolts = [
        [10, 10], [118, 10], [10, 118], [118, 118],
        [138, 10], [246, 10], [138, 118], [246, 118],
        [10, 138], [118, 138], [10, 246], [118, 246],
        [138, 138], [246, 138], [138, 246], [246, 246]
    ];
    ctx.fillStyle = '#ffffff';
    for (let b = 0; b < bolts.length; b++) {
        ctx.beginPath(); ctx.arc(bolts[b][0], bolts[b][1], 2.5, 0, Math.PI * 2); ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function createDroneRoughnessTexture() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.lineTo(256, 128);
    ctx.moveTo(128, 0); ctx.lineTo(128, 256);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function createDroneEmissiveTexture(isAlly) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = isAlly ? '#00ffcc' : '#ff3344';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 128); ctx.lineTo(128, 64); ctx.lineTo(224, 128);
    ctx.stroke();

    ctx.fillStyle = isAlly ? '#00ffcc' : '#ff3344';
    ctx.beginPath();
    ctx.arc(128, 64, 4, 0, Math.PI * 2); ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

const allyDroneTex = createDroneAlbedoTexture(true);
const enemyDroneTex = createDroneAlbedoTexture(false);
const droneBumpTex = createDroneBumpTexture();
const droneRoughnessTex = createDroneRoughnessTexture();
const allyDroneEmissiveTex = createDroneEmissiveTexture(true);
const enemyDroneEmissiveTex = createDroneEmissiveTexture(false);

// --- МАТЕРИАЛЫ ---
const allyBodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: allyDroneTex,
    bumpMap: droneBumpTex,
    bumpScale: 0.04,
    roughnessMap: droneRoughnessTex,
    roughness: 0.28,
    metalness: 0.82,
    emissiveMap: allyDroneEmissiveTex,
    emissive: 0x00d4ff,
    emissiveIntensity: 0.4,
    vertexColors: true
});
const enemyBodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: enemyDroneTex,
    bumpMap: droneBumpTex,
    bumpScale: 0.04,
    roughnessMap: droneRoughnessTex,
    roughness: 0.28,
    metalness: 0.82,
    emissiveMap: enemyDroneEmissiveTex,
    emissive: 0xff3344,
    emissiveIntensity: 0.4,
    vertexColors: true
});
const frameMat = new THREE.MeshStandardMaterial({ color: 0x141822, metalness: 0.9, roughness: 0.25 });
const allyRotorMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, metalness: 0.3, roughness: 0.4 });
const enemyRotorMat = new THREE.MeshStandardMaterial({ color: 0xff3333, metalness: 0.3, roughness: 0.4 });
const allyLedMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
const enemyLedMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
const allyPlumeMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const enemyPlumeMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const allyHoverMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.8 });
const enemyHoverMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.8 });

const selectionRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
const droneShieldMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.45, wireframe: true, depthWrite: false });
const siegeRingMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });

const bossHullMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: enemyDroneTex,
    bumpMap: droneBumpTex,
    bumpScale: 0.06,
    roughnessMap: droneRoughnessTex,
    roughness: 0.35,
    metalness: 0.85,
    emissiveMap: enemyDroneEmissiveTex,
    emissive: 0x660018,
    emissiveIntensity: 0.45
});
const bossCoreMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
const bossShieldMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.35, wireframe: true, depthWrite: false });

// 1. Создание стандартного боевого дрона (Квадрокоптер)
function createStandardDrone(isAlly) {
    const group = new THREE.Group();
    const bodyMat = isAlly ? allyBodyMat : enemyBodyMat;
    const rotorMat = isAlly ? allyRotorMat : enemyRotorMat;
    const ledMat = isAlly ? allyLedMat : enemyLedMat;
    const plumeMat = isAlly ? allyPlumeMat : enemyPlumeMat;

    // Корпус
    const body = new THREE.Mesh(droneBodyGeo, bodyMat);
    body.position.y = 0.15;
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);

    // Сенсорный визор
    const eye = new THREE.Mesh(droneEyeGeo, ledMat);
    eye.position.set(0, 0.16, 0.25);
    group.add(eye);

    // Сдвоенные фронтальные микро-пушки
    const gun1 = new THREE.Mesh(droneGunGeo, frameMat);
    gun1.position.set(-0.14, 0.12, 0.28);
    const gun2 = new THREE.Mesh(droneGunGeo, frameMat);
    gun2.position.set(0.14, 0.12, 0.28);
    group.add(gun1, gun2);

    // Сопло и форсажный шлейф
    const thruster = new THREE.Mesh(droneThrusterGeo, frameMat);
    thruster.position.set(0, 0.13, -0.24);
    thruster.rotation.x = Math.PI / 2;
    group.add(thruster);

    const plume = new THREE.Mesh(dronePlumeGeo, plumeMat);
    plume.position.set(0, 0.13, -0.30);
    plume.rotation.x = -Math.PI / 2;
    group.add(plume);

    // Несущие лучи роторов (X-образная рама)
    const arm1 = new THREE.Mesh(droneArmGeo, frameMat);
    arm1.position.y = 0.15; arm1.rotation.y = Math.PI / 4;
    const arm2 = new THREE.Mesh(droneArmGeo, frameMat);
    arm2.position.y = 0.15; arm2.rotation.y = -Math.PI / 4;
    group.add(arm1, arm2);

    // 4 вращающихся ротора
    const rotors = [];
    const dist = 0.28;
    const rotorCoords = [
        { x: dist, z: dist }, { x: -dist, z: dist },
        { x: dist, z: -dist }, { x: -dist, z: -dist }
    ];
    for (let i = 0; i < 4; i++) {
        const pt = rotorCoords[i];
        const motor = new THREE.Mesh(droneMotorGeo, frameMat);
        motor.position.set(pt.x, 0.18, pt.z);
        group.add(motor);

        const blade = new THREE.Mesh(droneBladeGeo, rotorMat);
        blade.position.set(pt.x, 0.21, pt.z);
        blade.rotation.y = Math.random() * Math.PI;
        group.add(blade);
        rotors.push(blade);
    }

    const selectionRing = new THREE.Mesh(droneSelectionRingGeo, selectionRingMat);
    selectionRing.position.y = -0.65; selectionRing.visible = false;
    group.add(selectionRing);

    const shieldMesh = new THREE.Mesh(droneShieldGeo, droneShieldMat.clone());
    shieldMesh.position.y = 0.15; shieldMesh.visible = false;
    group.add(shieldMesh);

    const siegeMesh = new THREE.Mesh(siegeRingGeo, siegeRingMat.clone());
    siegeMesh.position.y = -0.68; siegeMesh.visible = false;
    group.add(siegeMesh);

    group.userData = {
        rotors: rotors,
        hoverOffset: Math.random() * 100,
        velocity: new THREE.Vector3(),
        enginePlume: plume,
        selectionRing: selectionRing,
        shieldMesh: shieldMesh,
        siegeMesh: siegeMesh
    };

    return group;
}

// 2. Создание скоростного разведчика (Стреловидный перехватчик)
function createScoutDrone(isAlly) {
    const group = new THREE.Group();
    const bodyMat = isAlly ? allyBodyMat : enemyBodyMat;
    const ledMat = isAlly ? allyLedMat : enemyLedMat;
    const plumeMat = isAlly ? allyPlumeMat : enemyPlumeMat;

    // Стреловидный фюзеляж
    const hull = new THREE.Mesh(scoutHullGeo, bodyMat);
    hull.position.y = 0.14;
    hull.castShadow = true; hull.receiveShadow = true;
    group.add(hull);

    // Панорамный сенсорный фонарь
    const visor = new THREE.Mesh(scoutVisorGeo, ledMat);
    visor.position.set(0, 0.17, 0.22);
    group.add(visor);

    // Дельта-крылья
    const wings = new THREE.Mesh(scoutWingGeo, frameMat);
    wings.position.set(0, 0.14, -0.05);
    wings.castShadow = true;
    group.add(wings);

    // Кили стабилизатора
    const finL = new THREE.Mesh(scoutFinGeo, frameMat);
    finL.position.set(-0.32, 0.20, -0.15);
    const finR = new THREE.Mesh(scoutFinGeo, frameMat);
    finR.position.set(0.32, 0.20, -0.15);
    group.add(finL, finR);

    // Сдвоенные реактивные сопла и факелы
    const plumeGroup = new THREE.Group();
    const thrusterL = new THREE.Mesh(droneThrusterGeo, frameMat);
    thrusterL.position.set(-0.08, 0.13, -0.32); thrusterL.rotation.x = Math.PI / 2;
    const thrusterR = new THREE.Mesh(droneThrusterGeo, frameMat);
    thrusterR.position.set(0.08, 0.13, -0.32); thrusterR.rotation.x = Math.PI / 2;
    group.add(thrusterL, thrusterR);

    const plumeL = new THREE.Mesh(dronePlumeGeo, plumeMat);
    plumeL.position.set(-0.08, 0.13, -0.38); plumeL.rotation.x = -Math.PI / 2;
    const plumeR = new THREE.Mesh(dronePlumeGeo, plumeMat);
    plumeR.position.set(0.08, 0.13, -0.38); plumeR.rotation.x = -Math.PI / 2;
    plumeGroup.add(plumeL, plumeR);
    group.add(plumeGroup);

    const selectionRing = new THREE.Mesh(droneSelectionRingGeo, selectionRingMat);
    selectionRing.position.y = -0.65; selectionRing.visible = false;
    group.add(selectionRing);

    const shieldMesh = new THREE.Mesh(droneShieldGeo, droneShieldMat.clone());
    shieldMesh.position.y = 0.15; shieldMesh.visible = false;
    group.add(shieldMesh);

    const siegeMesh = new THREE.Mesh(siegeRingGeo, siegeRingMat.clone());
    siegeMesh.position.y = -0.68; siegeMesh.visible = false;
    group.add(siegeMesh);

    group.userData = {
        rotors: [],
        hoverOffset: Math.random() * 100,
        velocity: new THREE.Vector3(),
        enginePlume: plumeGroup,
        selectionRing: selectionRing,
        shieldMesh: shieldMesh,
        siegeMesh: siegeMesh
    };

    return group;
}

// 3. Создание тяжелого танка (Осадная платформа с двуствольным рельсотроном)
function createTankUnit(isAlly) {
    const group = new THREE.Group();
    const bodyMat = isAlly ? allyBodyMat : enemyBodyMat;
    const hoverMat = isAlly ? allyHoverMat : enemyHoverMat;
    const plumeMat = isAlly ? allyPlumeMat : enemyPlumeMat;

    // Тяжелый бронированный корпус
    const hull = new THREE.Mesh(tankHullGeo, bodyMat);
    hull.position.y = 0.18;
    hull.castShadow = true; hull.receiveShadow = true;
    group.add(hull);

    // Бортовые броневые экраны
    const skirtL = new THREE.Mesh(tankSkirtGeo, frameMat);
    skirtL.position.set(-0.42, 0.16, 0); skirtL.castShadow = true;
    const skirtR = new THREE.Mesh(tankSkirtGeo, frameMat);
    skirtR.position.set(0.42, 0.16, 0); skirtR.castShadow = true;
    group.add(skirtL, skirtR);

    // Орудийная башня
    const turret = new THREE.Mesh(tankTurretGeo, frameMat);
    turret.position.set(0, 0.32, -0.05);
    group.add(turret);

    // Сдвоенные рельсовые орудия
    const barrelL = new THREE.Mesh(tankBarrelGeo, frameMat);
    barrelL.position.set(-0.12, 0.32, 0.38);
    const barrelR = new THREE.Mesh(tankBarrelGeo, frameMat);
    barrelR.position.set(0.12, 0.32, 0.38);
    const muzzleL = new THREE.Mesh(tankMuzzleGeo, bodyMat);
    muzzleL.position.set(-0.12, 0.32, 0.65);
    const muzzleR = new THREE.Mesh(tankMuzzleGeo, bodyMat);
    muzzleR.position.set(0.12, 0.32, 0.65);
    group.add(barrelL, barrelR, muzzleL, muzzleR);

    // 4 антигравитационных подушки
    const hoverCoords = [
        [-0.32, 0.32], [0.32, 0.32],
        [-0.32, -0.32], [0.32, -0.32]
    ];
    hoverCoords.forEach(([hx, hz]) => {
        const pod = new THREE.Mesh(tankHoverGeo, frameMat);
        pod.position.set(hx, 0.08, hz);
        const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8), hoverMat);
        emitter.position.set(hx, 0.02, hz);
        group.add(pod, emitter);
    });

    // Тяжелые выхлопные патрубки сзади
    const plume = new THREE.Mesh(dronePlumeGeo, plumeMat);
    plume.position.set(0, 0.18, -0.44);
    plume.rotation.x = -Math.PI / 2;
    plume.scale.set(1.4, 1.4, 1.4);
    group.add(plume);

    // Высоты колец заданы в локальных единицах модели, а модель танка масштабируется ×1.4:
    // при прежних −0.65 / −0.68 кольца уходили под землю и в режиме без инстансинга не были видны
    const selectionRing = new THREE.Mesh(droneSelectionRingGeo, selectionRingMat);
    selectionRing.position.y = -0.37; selectionRing.visible = false;
    group.add(selectionRing);

    const shieldMesh = new THREE.Mesh(droneShieldGeo, droneShieldMat.clone());
    shieldMesh.position.y = 0.22; shieldMesh.visible = false;
    group.add(shieldMesh);

    const siegeMesh = new THREE.Mesh(siegeRingGeo, siegeRingMat.clone());
    siegeMesh.position.y = -0.34; siegeMesh.visible = false;
    group.add(siegeMesh);

    group.userData = {
        rotors: [],
        hoverOffset: Math.random() * 100,
        velocity: new THREE.Vector3(),
        enginePlume: plume,
        selectionRing: selectionRing,
        shieldMesh: shieldMesh,
        siegeMesh: siegeMesh
    };

    return group;
}

// Фабричный метод выбора модели дрона по типу
function createDroneUnit(isAlly, type = 'standard') {
    if (type === 'scout') return createScoutDrone(isAlly);
    if (type === 'tank') return createTankUnit(isAlly);
    return createStandardDrone(isAlly);
}

// 4. Генератор 3D модели Босса-Левиафана
function createBossUnit() {
    const bossGroup = new THREE.Group();

    // Тяжелый корпус
    const hull = new THREE.Mesh(bossHullGeo, bossHullMat);
    hull.position.y = 0.35;
    hull.castShadow = true; hull.receiveShadow = true;
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

// 5. Постройка модернизированных штабов команд (HQ Command Citadel)
function createHQ(col, row, isPlayer) {
    const group = new THREE.Group();
    const factionColor = isPlayer ? 0x0077ff : 0xff3333;
    const glowColor = isPlayer ? 0x00ffcc : 0xff6644;

    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x141824, metalness: 0.8, roughness: 0.25,
        emissive: factionColor, emissiveIntensity: 0.2
    });
    const towerMat = new THREE.MeshStandardMaterial({
        color: factionColor, metalness: 0.7, roughness: 0.25,
        emissive: glowColor, emissiveIntensity: 0.45
    });
    const beaconMat = new THREE.MeshBasicMaterial({ color: glowColor });
    const ringMat = new THREE.MeshBasicMaterial({
        color: glowColor, side: THREE.DoubleSide, transparent: true, opacity: 0.55
    });

    // Укрепленный ступенчатый фундамент
    const base = new THREE.Mesh(hqBaseGeo, baseMat);
    base.position.y = 0.6;
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    // Цитадель командования
    const tower = new THREE.Mesh(hqTowerGeo, towerMat);
    tower.position.y = 2.2;
    tower.castShadow = true;
    group.add(tower);

    // Вращающийся голографический радар / диск
    const radar = new THREE.Mesh(hqRadarGeo, towerMat);
    radar.position.y = 4.4;
    group.add(radar);

    // Орбитальное голографическое кольцо связи
    const holoRing = new THREE.Mesh(hqHoloRingGeo, ringMat);
    holoRing.position.y = 2.4;
    group.add(holoRing);

    // Объединенный статический каркас (шпиль + 4 пилона в 1 меш)
    const staticFrame = new THREE.Mesh(hqStaticFrameGeo, frameMat);
    staticFrame.castShadow = true;
    group.add(staticFrame);

    // Объединенные статические маяки (верхний маяк + 4 маяка пилонов в 1 меш)
    const staticBeacons = new THREE.Mesh(hqStaticBeaconsGeo, beaconMat);
    group.add(staticBeacons);

    // Атмосферный свет штаба
    const light = new THREE.PointLight(glowColor, 2.8, 10.0);
    light.position.y = 3.6;
    group.add(light);

    const pos = gridToWorld(col, row);
    group.position.set(pos.x, 0, pos.z);
    scene.add(group);

    const hpBar = attachHealthBar(group, isPlayer, 5.4, 3.2);

    return {
        mesh: group,
        radarMesh: radar,
        holoRing: holoRing,
        hp: 500,
        maxHp: 500,
        radius: 1.8,
        healthBar: hpBar
    };
}

const playerHQ = createHQ(HQ_COL, HQ_ROW, true);
const enemyHQ = createHQ(ENEMY_HQ_COL, ENEMY_HQ_ROW, false);

