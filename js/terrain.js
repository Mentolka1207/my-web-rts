// =============================================================================
// js/terrain.js — Процедурные текстуры поверхности, сетка и стены препятствий
// =============================================================================

function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121622'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#252f4a'; ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 256, 256);
    ctx.strokeRect(128, 0, 128, 256); ctx.strokeRect(0, 128, 256, 128);
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * 256; const y = Math.random() * 256;
        ctx.fillStyle = `rgba(0, 255, 204, ${Math.random() * 0.06})`;
        ctx.fillRect(x, y, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    return texture;
}

function createWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#161c30'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#2b395c'; ctx.lineWidth = 6;
    ctx.strokeRect(2, 2, 124, 124);
    ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}

const groundTex = createGroundTexture();
const groundGeo = new THREE.PlaneGeometry(MAP_WORLD_SIZE, MAP_WORLD_SIZE);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.5, metalness: 0.2 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(MAP_WORLD_SIZE, GRID_SIZE, 0x00ffcc, 0x222d4a);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const wallTex = createWallTexture();
const wallGeo = new THREE.BoxGeometry(CELL_SIZE * 0.98, 1.5, CELL_SIZE * 0.98);
const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.2,
    metalness: 0.7,
    emissive: 0x00ffcc,
    emissiveIntensity: 0.12
});

for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
        const isHQCell = (row === HQ_ROW && col === HQ_COL) || (row === ENEMY_HQ_ROW && col === ENEMY_HQ_COL);
        if (grid[row][col] === 1 && !isHQCell) {
            const wall = new THREE.Mesh(wallGeo, wallMat);
            const pos = gridToWorld(col, row);
            wall.position.set(pos.x, 0.75, pos.z);
            wall.castShadow = true;
            wall.receiveShadow = true;
            scene.add(wall);
        }
    }
}
