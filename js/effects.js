// =============================================================================
// js/effects.js — Пул визуальных эффектов (Object Pooling для лазеров, вспышек, взрывов)
// =============================================================================

// Процедурная текстура вспышки
const flashCanvas = document.createElement('canvas');
flashCanvas.width = 32; flashCanvas.height = 32;
const flashCtx = flashCanvas.getContext('2d');
const flashGrad = flashCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
flashGrad.addColorStop(0, 'rgba(255,255,255,1)');
flashGrad.addColorStop(0.4, 'rgba(255,220,120,0.9)');
flashGrad.addColorStop(1, 'rgba(255,150,0,0)');
flashCtx.fillStyle = flashGrad;
flashCtx.fillRect(0, 0, 32, 32);
const flashTexture = new THREE.CanvasTexture(flashCanvas);
flashTexture.generateMipmaps = false;
flashTexture.minFilter = THREE.LinearFilter;

// Пул лазеров
const MAX_LASERS = 40;
const laserMeshes = [];
const laserGeometries = [];
const laserData = [];
const allyLaserMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 3 });
const enemyLaserMat = new THREE.LineBasicMaterial({ color: 0xff3333, linewidth: 3 });

for (let i = 0; i < MAX_LASERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, allyLaserMat);
    line.visible = false;
    scene.add(line);
    laserGeometries.push(geo);
    laserMeshes.push(line);
    laserData.push({ active: false, life: 0 });
}

// Пул вспышек попадания
const MAX_FLASHES = 40;
const flashSprites = [];
const flashData = [];
const allyFlashMat = new THREE.SpriteMaterial({
    map: flashTexture, color: 0x00ffcc, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
});
const enemyFlashMat = new THREE.SpriteMaterial({
    map: flashTexture, color: 0xff3333, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
});

for (let i = 0; i < MAX_FLASHES; i++) {
    const sprite = new THREE.Sprite(allyFlashMat);
    sprite.visible = false;
    scene.add(sprite);
    flashSprites.push(sprite);
    flashData.push({ active: false, elapsed: 0 });
}

function spawnHitFlash(position, isAlly) {
    let idx = -1;
    for (let i = 0; i < MAX_FLASHES; i++) {
        if (!flashData[i].active) { idx = i; break; }
    }
    if (idx === -1) idx = 0;

    const sprite = flashSprites[idx];
    sprite.material = isAlly ? allyFlashMat : enemyFlashMat;
    sprite.position.set(position.x, position.y + 0.15, position.z);
    sprite.scale.set(0.9, 0.9, 0.9);
    sprite.visible = true;

    flashData[idx].active = true;
    flashData[idx].elapsed = 0;
}

function fireLaser(fromPos, toPos, isAlly) {
    let idx = -1;
    for (let i = 0; i < MAX_LASERS; i++) {
        if (!laserData[i].active) { idx = i; break; }
    }
    if (idx === -1) idx = 0;

    const geo = laserGeometries[idx];
    const posAttr = geo.attributes.position;
    posAttr.setXYZ(0, fromPos.x, fromPos.y + 0.15, fromPos.z);
    posAttr.setXYZ(1, toPos.x, toPos.y + 0.15, toPos.z);
    posAttr.needsUpdate = true;

    const line = laserMeshes[idx];
    line.material = isAlly ? allyLaserMat : enemyLaserMat;
    line.visible = true;

    laserData[idx].active = true;
    laserData[idx].life = 0.08;

    spawnHitFlash(toPos, isAlly);
}

// Пул маркеров приказа (Move / Attack Waypoint Marker)
const MAX_ORDER_MARKERS = 8;
const orderMarkers = [];
const orderRingGeo = new THREE.RingGeometry(0.55, 0.72, 24);
orderRingGeo.rotateX(-Math.PI / 2);
const baseMarkerMat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false
});

for (let i = 0; i < MAX_ORDER_MARKERS; i++) {
    const mesh = new THREE.Mesh(orderRingGeo, baseMarkerMat.clone());
    mesh.visible = false;
    mesh.position.y = 0.04;
    scene.add(mesh);
    orderMarkers.push({ mesh: mesh, active: false, elapsed: 0, maxLife: 0.38 });
}

function spawnOrderMarker(x, z, isAttack = false) {
    let m = orderMarkers.find(o => !o.active);
    if (!m) m = orderMarkers[0];
    m.mesh.material.color.setHex(isAttack ? 0xff3333 : 0x00ffcc);
    m.mesh.position.set(x, 0.04, z);
    m.mesh.scale.set(0.5, 0.5, 0.5);
    m.mesh.material.opacity = 0.9;
    m.mesh.visible = true;
    m.active = true;
    m.elapsed = 0;
}

// Пул частиц неонового шлейфа двигателей (Overdrive Engine Trail)
const MAX_TRAIL_PARTICLES = 36;
const trailParticles = [];
const trailBoxGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const trailMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff, transparent: true, opacity: 0.85, depthWrite: false
});

for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
    const mesh = new THREE.Mesh(trailBoxGeo, trailMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    trailParticles.push({
        mesh: mesh,
        age: 0,
        maxLife: 0.35,
        active: false
    });
}

function spawnTrailParticle(x, y, z) {
    let p = trailParticles.find(t => !t.active);
    if (!p) p = trailParticles[0];
    p.active = true;
    p.age = 0;
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.1, y, z + (Math.random() - 0.5) * 0.1);
    p.mesh.scale.setScalar(1.0);
    p.mesh.material.opacity = 0.85;
    p.mesh.visible = true;
}

function updateTrailParticles(delta) {
    for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
        const p = trailParticles[i];
        if (!p.active) continue;
        p.age += delta;
        const progress = p.age / p.maxLife;
        if (progress >= 1) {
            p.active = false;
            p.mesh.visible = false;
        } else {
            const scale = 1.0 - progress * 0.6;
            p.mesh.scale.setScalar(scale);
            p.mesh.material.opacity = 0.85 * (1 - progress);
        }
    }
}

function updateVFX(delta) {
    for (let i = 0; i < MAX_LASERS; i++) {
        if (!laserData[i].active) continue;
        laserData[i].life -= delta;
        if (laserData[i].life <= 0) {
            laserData[i].active = false;
            laserMeshes[i].visible = false;
        }
    }

    const FLASH_DURATION = 0.15;
    for (let i = 0; i < MAX_FLASHES; i++) {
        if (!flashData[i].active) continue;
        flashData[i].elapsed += delta;
        const t = flashData[i].elapsed / FLASH_DURATION;
        if (t >= 1) {
            flashData[i].active = false;
            flashSprites[i].visible = false;
        } else {
            const s = 0.9 * (1 + t * 0.6);
            flashSprites[i].scale.set(s, s, s);
        }
    }

    for (let i = 0; i < MAX_ORDER_MARKERS; i++) {
        const m = orderMarkers[i];
        if (!m.active) continue;
        m.elapsed += delta;
        const progress = m.elapsed / m.maxLife;
        if (progress >= 1) {
            m.active = false;
            m.mesh.visible = false;
        } else {
            const s = 0.5 + progress * 0.6;
            m.mesh.scale.set(s, s, s);
            m.mesh.material.opacity = 0.9 * (1 - progress);
        }
    }

    updateTrailParticles(delta);
}

// Пул частиц взрывов
const MAX_EXPLOSION_PARTICLES = 120;
const explosionParticles = [];
const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const particleMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    new THREE.MeshBasicMaterial({ color: 0xff6600 }),
    new THREE.MeshBasicMaterial({ color: 0xffcc33 }),
    new THREE.MeshBasicMaterial({ color: 0xff3300 }),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff }) // искры щита
];

for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
    const mat = particleMaterials[i % particleMaterials.length];
    const mesh = new THREE.Mesh(sharedBoxGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    explosionParticles.push({
        mesh: mesh,
        velocity: new THREE.Vector3(),
        age: 0,
        maxLife: 0.5,
        baseSize: 0.1,
        active: false
    });
}

function spawnExplosion(position, count = 10) {
    let spawned = 0;
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES && spawned < count; i++) {
        const p = explosionParticles[i];
        if (!p.active) {
            p.active = true;
            p.age = 0;
            p.maxLife = 0.35 + Math.random() * 0.25;
            p.baseSize = 0.08 + Math.random() * 0.12;
            p.mesh.position.set(position.x, position.y, position.z);
            p.mesh.scale.setScalar(p.baseSize);
            p.mesh.visible = true;

            const angle = Math.random() * Math.PI * 2;
            const speed = 2.0 + Math.random() * 4.0;
            p.velocity.set(
                Math.cos(angle) * speed,
                3.0 + Math.random() * 3.5,
                Math.sin(angle) * speed
            );
            spawned++;
        }
    }
}

function updateExplosions(delta) {
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
        const p = explosionParticles[i];
        if (!p.active) continue;
        p.age += delta;
        p.velocity.y -= 9.0 * delta;
        p.mesh.position.addScaledVector(p.velocity, delta);

        const lifeRatio = 1 - (p.age / p.maxLife);
        if (lifeRatio <= 0 || p.mesh.position.y < 0) {
            p.active = false;
            p.mesh.visible = false;
        } else {
            p.mesh.scale.setScalar(Math.max(0.01, p.baseSize * lifeRatio));
        }
    }
}

// Опалённые следы на земле
const scorchCanvas = document.createElement('canvas');
scorchCanvas.width = 64; scorchCanvas.height = 64;
const scorchCtx = scorchCanvas.getContext('2d');
const scorchGrad = scorchCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
scorchGrad.addColorStop(0, 'rgba(10,8,6,0.75)');
scorchGrad.addColorStop(0.7, 'rgba(10,8,6,0.4)');
scorchGrad.addColorStop(1, 'rgba(10,8,6,0)');
scorchCtx.fillStyle = scorchGrad;
scorchCtx.fillRect(0, 0, 64, 64);
const scorchTexture = new THREE.CanvasTexture(scorchCanvas);
scorchTexture.generateMipmaps = false;
scorchTexture.minFilter = THREE.LinearFilter;

const scorchGeo = new THREE.PlaneGeometry(1.6, 1.6);
const scorchMat = new THREE.MeshBasicMaterial({ map: scorchTexture, transparent: true, depthWrite: false });
const scorches = [];
const MAX_SCORCHES = 60;

function spawnScorch(position) {
    const decal = new THREE.Mesh(scorchGeo, scorchMat);
    decal.position.set(position.x, 0.03, position.z);
    decal.rotation.x = -Math.PI / 2;
    decal.rotateZ(Math.random() * Math.PI * 2);
    scene.add(decal);
    scorches.push(decal);

    if (scorches.length > MAX_SCORCHES) {
        const old = scorches.shift();
        scene.remove(old);
    }
}
