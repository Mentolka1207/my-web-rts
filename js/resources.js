// =============================================================================
// js/resources.js — Стратегические точки сбора ресурсов (кристаллы и захват)
// =============================================================================

const NODE_ENERGY_BONUS = 3;
const CAPTURE_RADIUS = 2.8;
const CAPTURE_RADIUS_SQ = CAPTURE_RADIUS * CAPTURE_RADIUS;

const nodeBaseGeo = new THREE.CylinderGeometry(1.2, 1.4, 0.22, 8);
const nodeRingGeo = new THREE.RingGeometry(CAPTURE_RADIUS - 0.2, CAPTURE_RADIUS, 32);
nodeRingGeo.rotateX(-Math.PI / 2);
const nodeCrystalGeo = new THREE.OctahedronGeometry(0.75, 0);
nodeCrystalGeo.scale(0.7, 1.35, 0.7);
const nodeCoreGeo = new THREE.SphereGeometry(0.25, 8, 8);

function createResourceNode(col, row, name) {
    const group = new THREE.Group();
    const worldPos = gridToWorld(col, row);
    group.position.set(worldPos.x, 0, worldPos.z);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x181c26, roughness: 0.35, metalness: 0.85 });
    const baseMesh = new THREE.Mesh(nodeBaseGeo, baseMat);
    baseMesh.position.y = 0.11;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    const ringMesh = new THREE.Mesh(nodeRingGeo, ringMat);
    ringMesh.position.y = 0.03;
    group.add(ringMesh);

    const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x223344, roughness: 0.15, metalness: 0.5,
        emissive: 0xffaa00, emissiveIntensity: 0.8, transparent: true, opacity: 0.92
    });
    const crystalMesh = new THREE.Mesh(nodeCrystalGeo, crystalMat);
    crystalMesh.position.y = 1.45;
    crystalMesh.castShadow = true;
    group.add(crystalMesh);

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coreMesh = new THREE.Mesh(nodeCoreGeo, coreMat);
    coreMesh.position.y = 1.45;
    group.add(coreMesh);

    const light = new THREE.PointLight(0xffaa00, 2.0, 7.5);
    light.position.y = 1.8;
    group.add(light);

    const barGroup = new THREE.Group();
    barGroup.position.set(0, 2.7, 0);
    const barWidth = 1.4;
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(barWidth, 0.12), new THREE.MeshBasicMaterial({ color: 0x111622, side: THREE.DoubleSide }));
    barGroup.add(barBg);

    const barFgGeo = new THREE.PlaneGeometry(barWidth, 0.12);
    barFgGeo.translate(barWidth / 2, 0, 0);
    const barFgMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide });
    const barFg = new THREE.Mesh(barFgGeo, barFgMat);
    barFg.position.x = -barWidth / 2;
    barFg.scale.x = 0;
    barGroup.add(barFg);

    group.add(barGroup);
    scene.add(group);

    return {
        name: name, col: col, row: row,
        pos: new THREE.Vector3(worldPos.x, 0, worldPos.z),
        group: group,
        crystalMesh: crystalMesh,
        coreMesh: coreMesh,
        ringMat: ringMat,
        crystalMat: crystalMat,
        light: light,
        barGroup: barGroup,
        barFg: barFg,
        barFgMat: barFgMat,
        owner: 'neutral',
        captureProgress: 0
    };
}

const resourceNodes = RESOURCE_NODE_COORDS.map(c => createResourceNode(c.col, c.row, c.name));

function updateResourceNodes(delta, currentTime) {
    let playerNodesCount = 0;

    for (let idx = 0; idx < resourceNodes.length; idx++) {
        const node = resourceNodes[idx];
        node.crystalMesh.rotation.y += delta * 1.5;
        node.crystalMesh.position.y = 1.45 + Math.sin(currentTime * 2.2 + idx * 1.8) * 0.2;
        node.coreMesh.position.y = node.crystalMesh.position.y;
        node.barGroup.quaternion.copy(camera.quaternion);

        let allyCount = 0;
        let enemyCount = 0;

        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (u.hp > 0) {
                const dx = u.mesh.position.x - node.pos.x;
                const dz = u.mesh.position.z - node.pos.z;
                if (dx * dx + dz * dz <= CAPTURE_RADIUS_SQ) allyCount++;
            }
        }

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.hp > 0) {
                const dx = e.mesh.position.x - node.pos.x;
                const dz = e.mesh.position.z - node.pos.z;
                if (dx * dx + dz * dz <= CAPTURE_RADIUS_SQ) enemyCount++;
            }
        }

        const isContested = allyCount > 0 && enemyCount > 0;
        if (!isContested) {
            if (allyCount > 0) {
                const speed = 0.22 + 0.08 * (allyCount - 1);
                node.captureProgress = Math.min(1.0, node.captureProgress + speed * delta);
            } else if (enemyCount > 0) {
                const speed = 0.20 + 0.07 * (enemyCount - 1);
                node.captureProgress = Math.max(-1.0, node.captureProgress - speed * delta);
            }
        }

        if (node.captureProgress >= 1.0) node.owner = 'player';
        else if (node.captureProgress <= -1.0) node.owner = 'enemy';
        else if (Math.abs(node.captureProgress) < 0.05) node.owner = 'neutral';

        if (node.owner === 'player') playerNodesCount++;

        let activeColorHex = 0xffaa00;
        if (node.captureProgress > 0) activeColorHex = 0x00ffcc;
        else if (node.captureProgress < 0) activeColorHex = 0xff3333;

        if (isContested && Math.sin(currentTime * 12) > 0) {
            activeColorHex = 0x00ffcc;
        }

        node.crystalMat.emissive.setHex(activeColorHex);
        node.light.color.setHex(activeColorHex);
        node.ringMat.color.setHex(activeColorHex);
        node.barFgMat.color.setHex(activeColorHex);
        node.barFg.scale.x = Math.max(0.02, Math.abs(node.captureProgress));
    }

    return playerNodesCount;
}
