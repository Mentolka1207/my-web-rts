// =============================================================================
// js/healthbar.js — 3D Полоски здоровья юнитов (Billboarding и двойной бар Босса)
// =============================================================================

const hpBarBgGeo = new THREE.PlaneGeometry(0.8, 0.1);
const hpBarFgGeo = new THREE.PlaneGeometry(0.8, 0.1);
hpBarFgGeo.translate(0.4, 0, 0);

const bossHpBarBgGeo = new THREE.PlaneGeometry(2.6, 0.22);
const bossHpBarFgGeo = new THREE.PlaneGeometry(2.6, 0.1);
bossHpBarFgGeo.translate(1.3, 0, 0);
const bossShieldBarGeo = new THREE.PlaneGeometry(2.6, 0.08);
bossShieldBarGeo.translate(1.3, 0, 0);

const hpBarBgMat = new THREE.MeshBasicMaterial({ color: 0x4a0e0e, side: THREE.DoubleSide });
const allyHpBarFgMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide });
const enemyHpBarFgMat = new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide });
const bossShieldBarMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide });

function attachHealthBar(parentMesh, isAlly, yOffset = 0.7, widthScale = 1.0) {
    const barGroup = new THREE.Group();
    barGroup.position.set(0, yOffset, 0);

    const bgMesh = new THREE.Mesh(hpBarBgGeo, hpBarBgMat);
    barGroup.add(bgMesh);

    const fgMat = isAlly ? allyHpBarFgMat : enemyHpBarFgMat;
    const fgMesh = new THREE.Mesh(hpBarFgGeo, fgMat);
    fgMesh.position.x = -0.4;
    barGroup.add(fgMesh);

    if (widthScale !== 1.0) {
        barGroup.scale.set(widthScale, widthScale, 1.0);
    }

    parentMesh.add(barGroup);
    return { group: barGroup, fg: fgMesh, isBoss: false };
}

function attachBossHealthBar(parentMesh) {
    const barGroup = new THREE.Group();
    barGroup.position.set(0, 3.2, 0);

    const bgMesh = new THREE.Mesh(bossHpBarBgGeo, hpBarBgMat);
    barGroup.add(bgMesh);

    const hpMesh = new THREE.Mesh(bossHpBarFgGeo, enemyHpBarFgMat);
    hpMesh.position.set(-1.3, -0.05, 0.01);
    barGroup.add(hpMesh);

    const shieldMesh = new THREE.Mesh(bossShieldBarGeo, bossShieldBarMat);
    shieldMesh.position.set(-1.3, 0.05, 0.02);
    barGroup.add(shieldMesh);

    parentMesh.add(barGroup);
    return { group: barGroup, fg: hpMesh, shieldFg: shieldMesh, isBoss: true };
}

function updateHealthBar(hpBar, currentHp, maxHp, currentShield = 0, maxShield = 0) {
    hpBar.group.quaternion.copy(camera.quaternion);
    hpBar.fg.scale.x = Math.max(0, currentHp / maxHp);
    if (hpBar.isBoss && hpBar.shieldFg) {
        hpBar.shieldFg.scale.x = maxShield > 0 ? Math.max(0, currentShield / maxShield) : 0;
    }
}
