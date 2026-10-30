// =============================================================================
// js/resources.js — Стратегические точки сбора ресурсов (кристаллы и захват)
// =============================================================================

const NODE_ENERGY_BONUS = 3;
const CAPTURE_RADIUS = 2.8;
const CAPTURE_RADIUS_SQ = CAPTURE_RADIUS * CAPTURE_RADIUS;

const nodeBaseGeo = new THREE.CylinderGeometry(1.2, 1.45, 0.24, 8);
const nodeRingGeo = new THREE.RingGeometry(CAPTURE_RADIUS - 0.18, CAPTURE_RADIUS, 32);
nodeRingGeo.rotateX(-Math.PI / 2);
const nodeInnerRingGeo = new THREE.RingGeometry(1.4, 1.55, 24);
nodeInnerRingGeo.rotateX(-Math.PI / 2);

const nodeCrystalGeo = new THREE.IcosahedronGeometry(0.72, 0);
nodeCrystalGeo.scale(0.65, 1.45, 0.65);
const nodeShardGeo = new THREE.OctahedronGeometry(0.25, 0);
nodeShardGeo.scale(0.55, 1.25, 0.55);
const nodeCoreGeo = new THREE.OctahedronGeometry(0.32, 0);

// Предварительно объединенная геометрия орбитальных кристаллов-спутников (3 шарда в 1 геометрии)
const mergedSatellitesGeo = (() => {
    const shardAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    const dummy = new THREE.Object3D();
    const radius = 1.15;
    const items = shardAngles.map((angle, i) => {
        dummy.position.set(Math.cos(angle) * radius, (i - 1) * 0.18, Math.sin(angle) * radius);
        dummy.rotation.set(0, angle, 0.2);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        return { geometry: nodeShardGeo, matrix: dummy.matrix.clone() };
    });
    return mergeBufferGeometries(items);
})();

function createResourceNode(col, row, name) {
    const group = new THREE.Group();
    const worldPos = gridToWorld(col, row);
    group.position.set(worldPos.x, 0, worldPos.z);

    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x141824, roughness: 0.3, metalness: 0.85,
        emissive: 0xffaa00, emissiveIntensity: 0.15
    });
    const baseMesh = new THREE.Mesh(nodeBaseGeo, baseMat);
    baseMesh.position.y = 0.12;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Внешнее и внутреннее голографические кольца захвата
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    const ringMesh = new THREE.Mesh(nodeRingGeo, ringMat);
    ringMesh.position.y = 0.03;
    group.add(ringMesh);

    const innerRingMesh = new THREE.Mesh(nodeInnerRingGeo, ringMat);
    innerRingMesh.position.y = 0.035;
    group.add(innerRingMesh);

    // Главный кристалл-призма
    const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x1f2c3d, roughness: 0.12, metalness: 0.45,
        emissive: 0xffaa00, emissiveIntensity: 0.85, transparent: true, opacity: 0.92
    });
    const crystalMesh = new THREE.Mesh(nodeCrystalGeo, crystalMat);
    crystalMesh.position.y = 1.48;
    crystalMesh.castShadow = true;
    group.add(crystalMesh);

    // Внутреннее пульсирующее ядро
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coreMesh = new THREE.Mesh(nodeCoreGeo, coreMat);
    coreMesh.position.y = 1.48;
    group.add(coreMesh);

    // Кластер орбитальных кристаллов-спутников (объединен в 1 статический меш внутри вращающейся группы)
    const satellitesGroup = new THREE.Group();
    satellitesGroup.position.y = 1.48;
    const satellitesMesh = new THREE.Mesh(mergedSatellitesGeo, crystalMat);
    satellitesGroup.add(satellitesMesh);
    group.add(satellitesGroup);

    const light = new THREE.PointLight(0xffaa00, 2.2, 8.5);
    light.position.y = 1.8;
    group.add(light);

    const barGroup = new THREE.Group();
    barGroup.position.set(0, 2.8, 0);
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
        satellitesGroup: satellitesGroup,
        innerRingMesh: innerRingMesh,
        ringMat: ringMat,
        crystalMat: crystalMat,
        baseMat: baseMat,
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
        const hoverY = 1.48 + Math.sin(currentTime * 2.2 + idx * 1.8) * 0.18;
        node.crystalMesh.rotation.y += delta * 1.4;
        node.crystalMesh.position.y = hoverY;
        node.coreMesh.rotation.y -= delta * 2.2;
        node.coreMesh.position.y = hoverY;

        if (node.satellitesGroup) {
            node.satellitesGroup.rotation.y -= delta * 1.6;
            node.satellitesGroup.position.y = hoverY;
        }
        if (node.innerRingMesh) {
            node.innerRingMesh.rotation.z += delta * 0.8;
        }

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

        const prevOwner = node.owner;
        if (node.captureProgress >= 1.0) node.owner = 'player';
        else if (node.captureProgress <= -1.0) node.owner = 'enemy';
        else if (Math.abs(node.captureProgress) < 0.05) node.owner = 'neutral';

        if (prevOwner !== node.owner) {
            if (node.owner === 'player' && typeof playCaptureSound === 'function') {
                playCaptureSound(true);
            } else if (node.owner === 'enemy' && typeof playCaptureSound === 'function') {
                playCaptureSound(false);
            }

            if (typeof showTacticalAlert === 'function') {
                if (node.owner === 'player') {
                    if (typeof matchStats !== 'undefined' && (typeof benchmarkActive === 'undefined' || !benchmarkActive)) {
                        matchStats.nodesCaptured++;
                    }
                    showTacticalAlert(typeof t === 'function' ? t('ALERT_NODE_CAPTURED', node.name) : `🟢 Точка «${node.name}» под нашим контролем! (+${NODE_ENERGY_BONUS}⚡/сек)`, false);
                } else if (prevOwner === 'player' || node.owner === 'enemy') {
                    showTacticalAlert(typeof t === 'function' ? t('ALERT_NODE_LOST', node.name) : `🔴 Враг захватил точку «${node.name}»!`, true);
                }
            }
        }

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
