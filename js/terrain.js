// =============================================================================
// js/terrain.js — Процедурные текстуры поверхности, рельеф (Bump/Roughness),
// тактические стены-бастионы и энергетический периметр карты
// =============================================================================

// 1. Процедурная текстура диффузного цвета поверхности (Albedo / Diffuse)
function createGroundAlbedoTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Базовый титановый композит
    ctx.fillStyle = '#0f1422';
    ctx.fillRect(0, 0, 512, 512);

    // 4 модульные плиты (256x256 каждая)
    for (let py = 0; py < 2; py++) {
        for (let px = 0; px < 2; px++) {
            const ox = px * 256;
            const oy = py * 256;

            // Фоновая плита со сглаженным переходом
            ctx.fillStyle = ((px + py) % 2 === 0) ? '#131929' : '#111625';
            ctx.fillRect(ox + 3, oy + 3, 250, 250);

            // Фаски и кромки панелей
            ctx.strokeStyle = '#222d46';
            ctx.lineWidth = 2;
            ctx.strokeRect(ox + 4, oy + 4, 248, 248);

            // Внутренние суб-сегменты плиты (128x128)
            for (let sy = 0; sy < 2; sy++) {
                for (let sx = 0; sx < 2; sx++) {
                    const sox = ox + sx * 128;
                    const soy = oy + sy * 128;
                    ctx.strokeStyle = '#182033';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(sox + 4, soy + 4, 120, 120);

                    // Угловые монтажные болты / заклепки
                    const boltOffsets = [
                        [12, 12], [116, 12], [12, 116], [116, 116]
                    ];
                    for (let b = 0; b < boltOffsets.length; b++) {
                        const bx = sox + boltOffsets[b][0];
                        const by = soy + boltOffsets[b][1];
                        ctx.fillStyle = '#0a0d17';
                        ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#384869';
                        ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI * 2); ctx.fill();
                    }
                }
            }

            // Неоновые энерго-магистрали и чип-сетка (Cyan Circuit Traces)
            ctx.strokeStyle = 'rgba(0, 240, 200, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if ((px + py) % 2 === 0) {
                ctx.moveTo(ox + 20, oy + 128);
                ctx.lineTo(ox + 80, oy + 128);
                ctx.lineTo(ox + 128, oy + 80);
                ctx.lineTo(ox + 236, oy + 80);
            } else {
                ctx.moveTo(ox + 128, oy + 20);
                ctx.lineTo(ox + 128, oy + 90);
                ctx.lineTo(ox + 160, oy + 122);
                ctx.lineTo(ox + 160, oy + 236);
            }
            ctx.stroke();

            // Светящиеся узловые порты (Circuit Nodes)
            ctx.fillStyle = '#00ffcc';
            const nodeX = (px + py) % 2 === 0 ? ox + 80 : ox + 128;
            const nodeY = (px + py) % 2 === 0 ? oy + 128 : oy + 90;
            ctx.beginPath(); ctx.arc(nodeX, nodeY, 3, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Разделительные швы между плитами
    ctx.strokeStyle = '#080a11';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.stroke();

    // Микро-текстурный шум и металлическая шероховатость
    for (let i = 0; i < 3500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        ctx.fillStyle = Math.random() > 0.6 ? 'rgba(0, 255, 204, 0.05)' : 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(x, y, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(11, 11);
    return texture;
}

// 2. Процедурная карта рельефа (Bump Map) для создания физической глубины
function createGroundBumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Нейтральная высота (серый 128)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // Глубокие разделительные швы (темные бороздки)
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.stroke();

    // Швы суб-панелей
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.strokeRect(260, 4, 248, 248);
    ctx.strokeRect(4, 260, 248, 248);
    ctx.strokeRect(260, 260, 248, 248);

    // Выступающие заклепки (яркие белые точки = максимальный подъем рельефа)
    for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
            const bx = px * 128 + 20;
            const by = py * 128 + 20;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
            const bx2 = px * 128 + 108;
            const by2 = py * 128 + 108;
            ctx.beginPath(); ctx.arc(bx2, by2, 3.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Рельефные микропоры металла
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        ctx.fillStyle = Math.random() > 0.5 ? '#999999' : '#666666';
        ctx.fillRect(x, y, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(11, 11);
    return texture;
}

// 3. Процедурная карта шероховатости (Roughness Map)
function createGroundRoughnessTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Гладкий отражающий металл (низкая шероховатость)
    ctx.fillStyle = '#505050';
    ctx.fillRect(0, 0, 512, 512);

    // Швы и кромки — матовые (высокая шероховатость)
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(11, 11);
    return texture;
}

// 3.5. Процедурная карта нормалей (Normal Map) поверхности для кинематографичного PBR-освещения
function createGroundNormalTexture() {
    const width = 256, height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Генерация карты высот для расчета градиентов нормалей
    const heights = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isSeam = (x === 0 || y === 0 || x === 128 || y === 128);
            const isSub = (x % 64 === 0 || y % 64 === 0);
            heights[y * width + x] = isSeam ? 0.0 : (isSub ? 0.4 : 0.85);
        }
    }

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const xL = (x - 1 + width) % width;
            const xR = (x + 1) % width;
            const yU = (y - 1 + height) % height;
            const yD = (y + 1) % height;

            const dx = (heights[y * width + xR] - heights[y * width + xL]) * 2.2;
            const dy = (heights[yD * width + x] - heights[yU * width + x]) * 2.2;
            const dz = 1.0;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const idx = (y * width + x) * 4;
            data[idx] = Math.floor((-dx / len * 0.5 + 0.5) * 255);
            data[idx + 1] = Math.floor((-dy / len * 0.5 + 0.5) * 255);
            data[idx + 2] = Math.floor((dz / len * 0.5 + 0.5) * 255);
            data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(11, 11);
    return texture;
}

// 3.6. Процедурная карта свечения (Emissive Map) для неоновых энерголиний
function createGroundEmissiveTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Черный фон (нет свечения)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);

    // Неоновые линии энерго-магистралей (Cyan circuit)
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.85)';
    ctx.lineWidth = 2.5;

    for (let py = 0; py < 2; py++) {
        for (let px = 0; px < 2; px++) {
            const ox = px * 256;
            const oy = py * 256;
            ctx.beginPath();
            if ((px + py) % 2 === 0) {
                ctx.moveTo(ox + 20, oy + 128);
                ctx.lineTo(ox + 80, oy + 128);
                ctx.lineTo(ox + 128, oy + 80);
                ctx.lineTo(ox + 236, oy + 80);
            } else {
                ctx.moveTo(ox + 128, oy + 20);
                ctx.lineTo(ox + 128, oy + 90);
                ctx.lineTo(ox + 160, oy + 122);
                ctx.lineTo(ox + 160, oy + 236);
            }
            ctx.stroke();

            // Светящиеся узлы
            ctx.fillStyle = '#00ffcc';
            const nodeX = (px + py) % 2 === 0 ? ox + 80 : ox + 128;
            const nodeY = (px + py) % 2 === 0 ? oy + 128 : oy + 90;
            ctx.beginPath(); ctx.arc(nodeX, nodeY, 4, 0, Math.PI * 2); ctx.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(11, 11);
    return texture;
}

// 4. Текстура стен-препятствий (Monolith Blast Shields)
function createWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Темная броневая сталь
    ctx.fillStyle = '#111624';
    ctx.fillRect(0, 0, 256, 256);

    // Броневые пластины
    ctx.fillStyle = '#171f33';
    ctx.fillRect(8, 8, 240, 240);

    // Вентиляционные решетки охлаждения (Heatsink Grills)
    const grillYStart = 64;
    const grillCount = 8;
    for (let i = 0; i < grillCount; i++) {
        const y = grillYStart + i * 16;
        ctx.fillStyle = '#0a0d16';
        ctx.fillRect(24, y, 208, 10);

        // Внутреннее неоновое свечение реактора
        ctx.fillStyle = 'rgba(0, 255, 204, 0.75)';
        ctx.fillRect(28, y + 3, 200, 4);
    }

    // Диагональные предупреждающие полосы (Sci-Fi Hazard Chevrons) на верхней кромке
    ctx.save();
    ctx.beginPath();
    ctx.rect(8, 8, 240, 36);
    ctx.clip();
    for (let x = -40; x < 300; x += 28) {
        ctx.fillStyle = 'rgba(0, 255, 204, 0.85)';
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x + 16, 8);
        ctx.lineTo(x + 4, 44);
        ctx.lineTo(x - 12, 44);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // Внешняя рама и крепежи
    ctx.strokeStyle = '#2b3a5c';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 248);

    return new THREE.CanvasTexture(canvas);
}

// Рельефная карта для стен
function createWallBumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    // Углубленные вентиляционные прорези
    const grillYStart = 64;
    for (let i = 0; i < 8; i++) {
        const y = grillYStart + i * 16;
        ctx.fillStyle = '#202020';
        ctx.fillRect(24, y, 208, 10);
    }

    // Выступающая рама
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 248);

    return new THREE.CanvasTexture(canvas);
}

// Инициализация поверхности земли с PBR-материалом
const groundTex = createGroundAlbedoTexture();
const groundBumpTex = createGroundBumpTexture();
const groundRoughnessTex = createGroundRoughnessTexture();
const groundNormalTex = createGroundNormalTexture();
const groundEmissiveTex = createGroundEmissiveTexture();

const groundGeo = new THREE.PlaneGeometry(MAP_WORLD_SIZE, MAP_WORLD_SIZE);
const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    bumpMap: groundBumpTex,
    bumpScale: 0.045,
    normalMap: groundNormalTex,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: groundRoughnessTex,
    roughness: 0.45,
    metalness: 0.35,
    emissiveMap: groundEmissiveTex,
    emissive: 0x00ffcc,
    emissiveIntensity: 0.18
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Высокотехнологичная тактическая сетка
const gridHelper = new THREE.GridHelper(MAP_WORLD_SIZE, GRID_SIZE, 0x00ffcc, 0x19243c);
gridHelper.position.y = 0.015;
scene.add(gridHelper);

// Энергетический периметр карты (Arena Perimeter Rails & Corner Pylons) — оптимизированное объединение геометрий
const perimeterGroup = new THREE.Group();
const halfSize = MAP_WORLD_SIZE / 2;
const borderRailMat = new THREE.MeshStandardMaterial({
    color: 0x0f1524,
    roughness: 0.3,
    metalness: 0.8,
    emissive: 0x00ffcc,
    emissiveIntensity: 0.35
});
const railGeoH = new THREE.BoxGeometry(MAP_WORLD_SIZE, 0.22, 0.3);
const railGeoV = new THREE.BoxGeometry(0.3, 0.22, MAP_WORLD_SIZE);

// Объединение 4 рельсов в 1 статический меш
const mRailTop = new THREE.Matrix4().makeTranslation(0, 0.11, -halfSize);
const mRailBottom = new THREE.Matrix4().makeTranslation(0, 0.11, halfSize);
const mRailLeft = new THREE.Matrix4().makeTranslation(-halfSize, 0.11, 0);
const mRailRight = new THREE.Matrix4().makeTranslation(halfSize, 0.11, 0);

const mergedRailsGeo = mergeBufferGeometries([
    { geometry: railGeoH, matrix: mRailTop },
    { geometry: railGeoH, matrix: mRailBottom },
    { geometry: railGeoV, matrix: mRailLeft },
    { geometry: railGeoV, matrix: mRailRight }
]);
const borderRailsMesh = new THREE.Mesh(mergedRailsGeo, borderRailMat);
perimeterGroup.add(borderRailsMesh);

// Угловые голографические пилоны — объединение 4 пилонов в 1 меш и 4 маяков в 1 меш
const pylonGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8);
const pylonMat = new THREE.MeshStandardMaterial({
    color: 0x141b2c,
    roughness: 0.2,
    metalness: 0.85,
    emissive: 0x00ffcc,
    emissiveIntensity: 0.6
});
const pylonBeaconGeo = new THREE.SphereGeometry(0.18, 8, 8);
const pylonBeaconMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });

const cornerCoords = [
    [-halfSize, -halfSize], [halfSize, -halfSize],
    [-halfSize, halfSize],  [halfSize, halfSize]
];

const mergedPylonsGeo = mergeBufferGeometries(cornerCoords.map(([cx, cz]) => ({
    geometry: pylonGeo,
    matrix: new THREE.Matrix4().makeTranslation(cx, 0.6, cz)
})));
const pylonsMesh = new THREE.Mesh(mergedPylonsGeo, pylonMat);
pylonsMesh.castShadow = true;

const mergedBeaconsGeo = mergeBufferGeometries(cornerCoords.map(([cx, cz]) => ({
    geometry: pylonBeaconGeo,
    matrix: new THREE.Matrix4().makeTranslation(cx, 1.3, cz)
})));
const beaconsMesh = new THREE.Mesh(mergedBeaconsGeo, pylonBeaconMat);

perimeterGroup.add(pylonsMesh, beaconsMesh);
scene.add(perimeterGroup);


// Материалы и геометрия стен-монолитов
const wallTex = createWallTexture();
const wallBumpTex = createWallBumpTexture();

const wallGeo = new THREE.BoxGeometry(CELL_SIZE * 0.96, 1.5, CELL_SIZE * 0.96);
const wallCapGeo = new THREE.BoxGeometry(CELL_SIZE * 0.98, 0.15, CELL_SIZE * 0.98);
const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    bumpMap: wallBumpTex,
    bumpScale: 0.08,
    roughness: 0.25,
    metalness: 0.75,
    emissive: 0x00ffcc,
    emissiveIntensity: 0.16
});
const wallCapMat = new THREE.MeshStandardMaterial({
    color: 0x1c2438,
    roughness: 0.2,
    metalness: 0.85,
    emissive: 0x00ffcc,
    emissiveIntensity: 0.25
});

let instancedWalls = null;
let instancedCaps = null;

function buildInstancedWalls() {
    if (instancedWalls) {
        scene.remove(instancedWalls);
        instancedWalls = null;
    }
    if (instancedCaps) {
        scene.remove(instancedCaps);
        instancedCaps = null;
    }

    const wallPositions = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            const isHQCell = (row === HQ_ROW && col === HQ_COL) || (row === ENEMY_HQ_ROW && col === ENEMY_HQ_COL);
            if (grid[row][col] === 1 && !isHQCell) {
                wallPositions.push(gridToWorld(col, row));
            }
        }
    }

    if (wallPositions.length === 0) return;

    instancedWalls = new THREE.InstancedMesh(wallGeo, wallMat, wallPositions.length);
    instancedCaps = new THREE.InstancedMesh(wallCapGeo, wallCapMat, wallPositions.length);
    instancedWalls.castShadow = true;
    instancedWalls.receiveShadow = true;
    instancedCaps.castShadow = true;
    instancedCaps.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < wallPositions.length; i++) {
        const pos = wallPositions[i];
        dummy.position.set(pos.x, 0.75, pos.z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        instancedWalls.setMatrixAt(i, dummy.matrix);

        dummy.position.set(pos.x, 1.55, pos.z);
        dummy.updateMatrix();
        instancedCaps.setMatrixAt(i, dummy.matrix);
    }

    instancedWalls.instanceMatrix.needsUpdate = true;
    instancedCaps.instanceMatrix.needsUpdate = true;

    scene.add(instancedWalls);
    scene.add(instancedCaps);
}

buildInstancedWalls();

