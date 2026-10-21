// =============================================================================
// js/instancing.js — Высокопроизводительный GPU Instancing на THREE.InstancedMesh
// Сокращение Draw Calls с 12 000+ до ~16 за счёт объединения однотипных юнитов,
// единого инстансированного меша биллбордов здоровья (Health Bars) с шейдером
// и инстансированных колец выделения / лазеров.
// =============================================================================

const MAX_INSTANCES_PER_TYPE = 2000;
const MAX_HEALTHBAR_INSTANCES = 4000;
const MAX_INSTANCED_LASERS = 60;

// Утилита объединения геометрий (Zero-Dependency BufferGeometry Merger)
function mergeGeometries(list) {
    let vertexCount = 0;
    let indexCount = 0;
    const processed = [];

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        let geo = item.geometry;
        if (!geo.index) {
            geo = geo.toNonIndexed();
        }
        processed.push({ geo: geo, matrix: item.matrix || new THREE.Matrix4() });
        vertexCount += geo.attributes.position.count;
        indexCount += geo.index ? geo.index.count : 0;
    }

    const merged = new THREE.BufferGeometry();
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    let vOffset = 0;
    let iOffset = 0;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();

    for (let p = 0; p < processed.length; p++) {
        const item = processed[p];
        const geo = item.geo;
        const mat = item.matrix;
        normalMatrix.getNormalMatrix(mat);
        const posAttr = geo.attributes.position;
        const normAttr = geo.attributes.normal;
        const count = posAttr.count;

        for (let i = 0; i < count; i++) {
            v.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
            positions[(vOffset + i) * 3] = v.x;
            positions[(vOffset + i) * 3 + 1] = v.y;
            positions[(vOffset + i) * 3 + 2] = v.z;

            if (normAttr) {
                n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
                normals[(vOffset + i) * 3] = n.x;
                normals[(vOffset + i) * 3 + 1] = n.y;
                normals[(vOffset + i) * 3 + 2] = n.z;
            }
        }

        if (geo.index) {
            for (let i = 0; i < geo.index.count; i++) {
                indices[iOffset + i] = geo.index.getX(i) + vOffset;
            }
            iOffset += geo.index.count;
        }
        vOffset += count;
    }

    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    if (indexCount > 0) {
        merged.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    return merged;
}

// 1. Построение композитных PBR геометрий
function buildCompositeDroneGeo() {
    const parts = [
        { geometry: new THREE.BoxGeometry(0.46, 0.14, 0.46), matrix: new THREE.Matrix4().makeTranslation(0, 0.15, 0) },
        { geometry: new THREE.BoxGeometry(0.2, 0.06, 0.07), matrix: new THREE.Matrix4().makeTranslation(0, 0.17, 0.23) },
        { geometry: new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8), matrix: new THREE.Matrix4().makeTranslation(0, 0.06, -0.2) },
        { geometry: new THREE.BoxGeometry(0.06, 0.03, 0.78), matrix: new THREE.Matrix4().makeRotationY(Math.PI / 4).setPosition(0, 0.16, 0) },
        { geometry: new THREE.BoxGeometry(0.06, 0.03, 0.78), matrix: new THREE.Matrix4().makeRotationY(-Math.PI / 4).setPosition(0, 0.16, 0) },
        { geometry: new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6).rotateX(Math.PI / 2), matrix: new THREE.Matrix4().makeTranslation(-0.15, 0.07, 0.15) },
        { geometry: new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6).rotateX(Math.PI / 2), matrix: new THREE.Matrix4().makeTranslation(0.15, 0.07, 0.15) }
    ];
    return mergeGeometries(parts);
}

function buildCompositeScoutGeo() {
    const parts = [
        { geometry: new THREE.BoxGeometry(0.26, 0.1, 0.65), matrix: new THREE.Matrix4().makeTranslation(0, 0.12, 0) },
        { geometry: new THREE.BoxGeometry(0.72, 0.02, 0.24), matrix: new THREE.Matrix4().makeTranslation(0, 0.11, -0.05) },
        { geometry: new THREE.BoxGeometry(0.02, 0.14, 0.16), matrix: new THREE.Matrix4().makeTranslation(-0.28, 0.17, -0.15) },
        { geometry: new THREE.BoxGeometry(0.02, 0.14, 0.16), matrix: new THREE.Matrix4().makeTranslation(0.28, 0.17, -0.15) },
        { geometry: new THREE.BoxGeometry(0.18, 0.05, 0.12), matrix: new THREE.Matrix4().makeTranslation(0, 0.17, 0.2) },
        { geometry: new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), matrix: new THREE.Matrix4().makeTranslation(-0.08, 0.1, -0.32) },
        { geometry: new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), matrix: new THREE.Matrix4().makeTranslation(0.08, 0.1, -0.32) }
    ];
    return mergeGeometries(parts);
}

function buildCompositeTankGeo() {
    const parts = [
        { geometry: new THREE.BoxGeometry(0.72, 0.22, 0.82), matrix: new THREE.Matrix4().makeTranslation(0, 0.2, 0) },
        { geometry: new THREE.BoxGeometry(0.14, 0.18, 0.9), matrix: new THREE.Matrix4().makeTranslation(-0.43, 0.18, 0) },
        { geometry: new THREE.BoxGeometry(0.14, 0.18, 0.9), matrix: new THREE.Matrix4().makeTranslation(0.43, 0.18, 0) },
        { geometry: new THREE.CylinderGeometry(0.24, 0.28, 0.12, 6), matrix: new THREE.Matrix4().makeTranslation(0, 0.35, 0) },
        { geometry: new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8).rotateX(Math.PI / 2), matrix: new THREE.Matrix4().makeTranslation(-0.08, 0.36, 0.4) },
        { geometry: new THREE.CylinderGeometry(0.04, 0.05, 0.55, 8).rotateX(Math.PI / 2), matrix: new THREE.Matrix4().makeTranslation(0.08, 0.36, 0.4) },
        { geometry: new THREE.BoxGeometry(0.1, 0.08, 0.12), matrix: new THREE.Matrix4().makeTranslation(-0.08, 0.36, 0.68) },
        { geometry: new THREE.BoxGeometry(0.1, 0.08, 0.12), matrix: new THREE.Matrix4().makeTranslation(0.08, 0.36, 0.68) }
    ];
    return mergeGeometries(parts);
}

// 2. Инстансированные шейдерные полоски здоровья (GPU Billboarding Shader)
function createInstancedHealthBarMesh() {
    const quadGeo = new THREE.PlaneGeometry(0.8, 0.12);
    // Смещение по X, чтобы полоска заполнялась слева направо
    quadGeo.translate(0.4, 0, 0);

    const aHpRatio = new THREE.InstancedBufferAttribute(new Float32Array(MAX_HEALTHBAR_INSTANCES), 1);
    const aShieldRatio = new THREE.InstancedBufferAttribute(new Float32Array(MAX_HEALTHBAR_INSTANCES), 1);
    const aIsAlly = new THREE.InstancedBufferAttribute(new Float32Array(MAX_HEALTHBAR_INSTANCES), 1);

    quadGeo.setAttribute('aHpRatio', aHpRatio);
    quadGeo.setAttribute('aShieldRatio', aShieldRatio);
    quadGeo.setAttribute('aIsAlly', aIsAlly);

    const hpBarShaderMat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float aHpRatio;
            attribute float aShieldRatio;
            attribute float aIsAlly;

            varying vec2 vUv;
            varying float vHpRatio;
            varying float vShieldRatio;
            varying float vIsAlly;

            void main() {
                vUv = uv;
                vHpRatio = aHpRatio;
                vShieldRatio = aShieldRatio;
                vIsAlly = aIsAlly;

                // Извлечение мировой позиции из instanceMatrix
                #ifdef USE_INSTANCING
                    vec4 origin = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                #else
                    vec4 origin = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                #endif

                // Сферический GPU-биллбординг (всегда лицом к камере без CPU-тригонометрии)
                origin.xy += position.xy;
                gl_Position = projectionMatrix * origin;
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            varying float vHpRatio;
            varying float vShieldRatio;
            varying float vIsAlly;

            void main() {
                vec3 bg = vec3(0.12, 0.02, 0.02);
                vec3 hpCol = (vIsAlly > 0.5) ? vec3(0.0, 1.0, 0.8) : vec3(1.0, 0.2, 0.25);
                vec3 shieldCol = vec3(0.0, 0.83, 1.0);

                // Верхние 25% — щит, если щит активен (> 0)
                if (vShieldRatio > 0.001 && vUv.y > 0.68) {
                    if (vUv.x <= vShieldRatio) {
                        gl_FragColor = vec4(shieldCol, 0.95);
                    } else {
                        gl_FragColor = vec4(bg, 0.65);
                    }
                } else {
                    // Основная шкала здоровья
                    if (vUv.x <= vHpRatio) {
                        gl_FragColor = vec4(hpCol, 0.95);
                    } else {
                        gl_FragColor = vec4(bg, 0.75);
                    }
                }
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.InstancedMesh(quadGeo, hpBarShaderMat, MAX_HEALTHBAR_INSTANCES);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return mesh;
}

// 3. Инстансированные лучи лазеров (Замена 40 отдельных THREE.Line на единый InstancedMesh)
function createInstancedLaserMesh(isAlly) {
    const cylinderGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6);
    cylinderGeo.rotateX(Math.PI / 2);
    cylinderGeo.translate(0, 0, 0.5); // Начало от точки выстрела

    const mat = new THREE.MeshBasicMaterial({
        color: isAlly ? 0x00ffcc : 0xff3333,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
    });

    const mesh = new THREE.InstancedMesh(cylinderGeo, mat, MAX_INSTANCED_LASERS);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return mesh;
}

// Менеджер GPU Instancing
const instancedRenderer = {
    initialized: false,
    enabled: true,

    // Меши юнитов
    allyDroneMesh: null,
    enemyDroneMesh: null,
    allyScoutMesh: null,
    enemyScoutMesh: null,
    allyTankMesh: null,
    enemyTankMesh: null,

    // Меши интерфейса и эффектов
    selectionRingsMesh: null,
    healthBarsMesh: null,
    allyLasersMesh: null,
    enemyLasersMesh: null,

    // Временные scratch-объекты для Zero-Allocation
    _mat: new THREE.Matrix4(),
    _pos: new THREE.Vector3(),
    _quat: new THREE.Quaternion(),
    _scale: new THREE.Vector3(),
    _euler: new THREE.Euler(),
    _laserFrom: new THREE.Vector3(),
    _laserTo: new THREE.Vector3(),
    _laserDir: new THREE.Vector3(),

    init(targetScene) {
        if (this.initialized) return;

        const droneGeo = buildCompositeDroneGeo();
        const scoutGeo = buildCompositeScoutGeo();
        const tankGeo = buildCompositeTankGeo();

        this.allyDroneMesh = new THREE.InstancedMesh(droneGeo, allyBodyMat, MAX_INSTANCES_PER_TYPE);
        this.enemyDroneMesh = new THREE.InstancedMesh(droneGeo, enemyBodyMat, MAX_INSTANCES_PER_TYPE);

        this.allyScoutMesh = new THREE.InstancedMesh(scoutGeo, allyBodyMat, MAX_INSTANCES_PER_TYPE);
        this.enemyScoutMesh = new THREE.InstancedMesh(scoutGeo, enemyBodyMat, MAX_INSTANCES_PER_TYPE);

        this.allyTankMesh = new THREE.InstancedMesh(tankGeo, allyBodyMat, MAX_INSTANCES_PER_TYPE);
        this.enemyTankMesh = new THREE.InstancedMesh(tankGeo, enemyBodyMat, MAX_INSTANCES_PER_TYPE);

        // Инстансированные кольца выделения
        const ringGeo = new THREE.RingGeometry(0.5, 0.58, 20);
        ringGeo.rotateX(-Math.PI / 2);
        this.selectionRingsMesh = new THREE.InstancedMesh(ringGeo, selectionRingMat, MAX_INSTANCES_PER_TYPE);

        // Инстансированные полоски HP
        this.healthBarsMesh = createInstancedHealthBarMesh();

        // Инстансированные лазеры
        this.allyLasersMesh = createInstancedLaserMesh(true);
        this.enemyLasersMesh = createInstancedLaserMesh(false);

        // Включение теней
        const unitMeshes = [
            this.allyDroneMesh, this.enemyDroneMesh,
            this.allyScoutMesh, this.enemyScoutMesh,
            this.allyTankMesh, this.enemyTankMesh
        ];
        for (let i = 0; i < unitMeshes.length; i++) {
            unitMeshes[i].castShadow = true;
            unitMeshes[i].receiveShadow = true;
            unitMeshes[i].count = 0;
            targetScene.add(unitMeshes[i]);
        }

        this.selectionRingsMesh.count = 0;
        targetScene.add(this.selectionRingsMesh);

        targetScene.add(this.healthBarsMesh);
        targetScene.add(this.allyLasersMesh);
        targetScene.add(this.enemyLasersMesh);

        this.initialized = true;
    },

    // Очистка перед бенчмарком или новой игрой
    clear() {
        if (!this.initialized) return;
        this.allyDroneMesh.count = 0;
        this.enemyDroneMesh.count = 0;
        this.allyScoutMesh.count = 0;
        this.enemyScoutMesh.count = 0;
        this.allyTankMesh.count = 0;
        this.enemyTankMesh.count = 0;
        this.selectionRingsMesh.count = 0;
        this.healthBarsMesh.count = 0;
        this.allyLasersMesh.count = 0;
        this.enemyLasersMesh.count = 0;
    },

    // Обновление трансформаций инстансов за кадр
    update(allies, enemiesList, currentTime, delta) {
        if (!this.initialized || !this.enabled) return;

        let allyDroneCount = 0;
        let enemyDroneCount = 0;
        let allyScoutCount = 0;
        let enemyScoutCount = 0;
        let allyTankCount = 0;
        let enemyTankCount = 0;

        let selectedRingCount = 0;
        let healthBarCount = 0;

        const hpAttr = this.healthBarsMesh.geometry.attributes.aHpRatio;
        const shieldAttr = this.healthBarsMesh.geometry.attributes.aShieldRatio;
        const allyAttr = this.healthBarsMesh.geometry.attributes.aIsAlly;

        // Вспомогательная функция упаковки инстанса юнита
        const packUnit = (u, isAlly) => {
            if (u.hp <= 0) return;
            const pos = u.mesh.position;
            const uType = u.type || 'standard';
            const stats = isAlly ? DRONE_TYPES[uType] : (ENEMY_TYPES[uType] || ENEMY_TYPES.standard);
            const scale = (stats && stats.scale) ? stats.scale : 1.0;

            // Анимация парения
            const hover = Math.sin(currentTime * 3.5 + (u.hoverOffset || 0)) * 0.04;
            this._pos.set(pos.x, 0.75 + hover, pos.z);
            this._scale.set(scale, scale, scale);

            // Наклон корпуса при движении
            let tiltX = 0, tiltZ = 0;
            if (u.velocity) {
                tiltZ = -u.velocity.x * 0.08;
                tiltX = u.velocity.z * 0.08;
            }
            this._euler.set(tiltX, u.mesh.rotation.y || 0, tiltZ, 'YXZ');
            this._quat.setFromEuler(this._euler);
            this._mat.compose(this._pos, this._quat, this._scale);

            // Запись в соответствующий InstancedMesh
            if (isAlly) {
                if (uType === 'standard' && allyDroneCount < MAX_INSTANCES_PER_TYPE) {
                    this.allyDroneMesh.setMatrixAt(allyDroneCount++, this._mat);
                } else if (uType === 'scout' && allyScoutCount < MAX_INSTANCES_PER_TYPE) {
                    this.allyScoutMesh.setMatrixAt(allyScoutCount++, this._mat);
                } else if (uType === 'tank' && allyTankCount < MAX_INSTANCES_PER_TYPE) {
                    this.allyTankMesh.setMatrixAt(allyTankCount++, this._mat);
                }
            } else {
                if (uType === 'boss') {
                    // Босс-Левиафан сохраняет уникальную комплексную модель
                    return;
                }
                if (uType === 'standard' && enemyDroneCount < MAX_INSTANCES_PER_TYPE) {
                    this.enemyDroneMesh.setMatrixAt(enemyDroneCount++, this._mat);
                } else if (uType === 'scout' && enemyScoutCount < MAX_INSTANCES_PER_TYPE) {
                    this.enemyScoutMesh.setMatrixAt(enemyScoutCount++, this._mat);
                } else if (uType === 'tank' && enemyTankCount < MAX_INSTANCES_PER_TYPE) {
                    this.enemyTankMesh.setMatrixAt(enemyTankCount++, this._mat);
                }
            }

            // Кольцо выделения
            if (isAlly && u.selected && selectedRingCount < MAX_INSTANCES_PER_TYPE) {
                this._pos.set(pos.x, 0.04, pos.z);
                this._quat.setFromAxisAngle(THREE.Vector3_UP || new THREE.Vector3(0, 1, 0), currentTime * 1.5);
                this._scale.set(scale, scale, scale);
                this._mat.compose(this._pos, this._quat, this._scale);
                this.selectionRingsMesh.setMatrixAt(selectedRingCount++, this._mat);
            }

            // Инстансированная полоска здоровья
            if (healthBarCount < MAX_HEALTHBAR_INSTANCES) {
                const barY = pos.y + 0.65 * scale;
                this._pos.set(pos.x, barY, pos.z);
                this._quat.identity();
                this._scale.set(1, 1, 1);
                this._mat.compose(this._pos, this._quat, this._scale);
                this.healthBarsMesh.setMatrixAt(healthBarCount, this._mat);

                hpAttr.setX(healthBarCount, Math.max(0, u.hp / (u.maxHp || 100)));
                const sMax = u.maxShield || 0;
                shieldAttr.setX(healthBarCount, (sMax > 0 && u.shield) ? Math.max(0, u.shield / sMax) : 0);
                allyAttr.setX(healthBarCount, isAlly ? 1.0 : 0.0);
                healthBarCount++;
            }
        };

        for (let i = 0; i < allies.length; i++) packUnit(allies[i], true);
        for (let i = 0; i < enemiesList.length; i++) packUnit(enemiesList[i], false);

        // Применение счетчиков и флагов обновления
        this.allyDroneMesh.count = allyDroneCount;
        this.allyDroneMesh.instanceMatrix.needsUpdate = true;

        this.enemyDroneMesh.count = enemyDroneCount;
        this.enemyDroneMesh.instanceMatrix.needsUpdate = true;

        this.allyScoutMesh.count = allyScoutCount;
        this.allyScoutMesh.instanceMatrix.needsUpdate = true;

        this.enemyScoutMesh.count = enemyScoutCount;
        this.enemyScoutMesh.instanceMatrix.needsUpdate = true;

        this.allyTankMesh.count = allyTankCount;
        this.allyTankMesh.instanceMatrix.needsUpdate = true;

        this.enemyTankMesh.count = enemyTankCount;
        this.enemyTankMesh.instanceMatrix.needsUpdate = true;

        this.selectionRingsMesh.count = selectedRingCount;
        if (selectedRingCount > 0) this.selectionRingsMesh.instanceMatrix.needsUpdate = true;

        this.healthBarsMesh.count = healthBarCount;
        if (healthBarCount > 0) {
            this.healthBarsMesh.instanceMatrix.needsUpdate = true;
            hpAttr.needsUpdate = true;
            shieldAttr.needsUpdate = true;
            allyAttr.needsUpdate = true;
        }
    },

    // Обновление инстансированных лучей лазеров
    updateLasers(lasersData) {
        if (!this.initialized || !this.enabled) return;
        let allyCount = 0;
        let enemyCount = 0;

        for (let i = 0; i < lasersData.length; i++) {
            const l = lasersData[i];
            if (!l.active) continue;

            this._laserFrom.copy(l.from);
            this._laserTo.copy(l.to);
            this._laserDir.subVectors(this._laserTo, this._laserFrom);
            const dist = this._laserDir.length();
            if (dist < 0.01) continue;

            this._quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._laserDir.normalize());
            this._scale.set(1, 1, dist);
            this._mat.compose(this._laserFrom, this._quat, this._scale);

            if (l.isAlly && allyCount < MAX_INSTANCED_LASERS) {
                this.allyLasersMesh.setMatrixAt(allyCount++, this._mat);
            } else if (!l.isAlly && enemyCount < MAX_INSTANCED_LASERS) {
                this.enemyLasersMesh.setMatrixAt(enemyCount++, this._mat);
            }
        }

        this.allyLasersMesh.count = allyCount;
        if (allyCount > 0) this.allyLasersMesh.instanceMatrix.needsUpdate = true;

        this.enemyLasersMesh.count = enemyCount;
        if (enemyCount > 0) this.enemyLasersMesh.instanceMatrix.needsUpdate = true;
    }
};
