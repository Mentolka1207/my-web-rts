// =============================================================================
// js/scene.js — Three.js сцена, камера, освещение, рендерер
// =============================================================================

const container = typeof document !== 'undefined' && document.getElementById ? document.getElementById('canvas-container') : null;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090c16);
scene.fog = new THREE.Fog(0x090c16, 65, 125);

const camera = new THREE.PerspectiveCamera(45, (typeof window !== 'undefined' && window.innerWidth ? window.innerWidth / window.innerHeight : 1), 1, 1000);
const camDir = new THREE.Vector3(0, 42, 32).normalize();
const BASE_CAM_DIST = Math.hypot(42, 32);
let camPivot = new THREE.Vector3(0, 0, 0);
let camZoomDist = BASE_CAM_DIST;
const MIN_ZOOM_DIST = camZoomDist * 0.45;
const MAX_ZOOM_DIST = camZoomDist * 1.9;

function applyCameraTransform() {
    camera.position.copy(camPivot).addScaledVector(camDir, camZoomDist);
    camera.lookAt(camPivot.x, 0, camPivot.z);
}
applyCameraTransform();

const renderer = container ? new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }) : null;
if (renderer) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Кинематографичный Tone Mapping и улучшенные мягкие тени
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
}

function setShadowsEnabled(enabled) {
    if (!renderer) return;
    renderer.shadowMap.enabled = enabled;
    if (typeof dirLight !== 'undefined') {
        dirLight.castShadow = enabled;
    }
}

// Сбалансированная модель освещения (Ambient + Hemi + Key Directional + Rim Light)
const ambientLight = new THREE.AmbientLight(0x182033, 0.75);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x6ce5ff, 0x0e1424, 0.55);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.45);
dirLight.position.set(32, 64, 30);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.0003;
dirLight.shadow.normalBias = 0.02;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 135;
dirLight.shadow.camera.left = -32;
dirLight.shadow.camera.right = 32;
dirLight.shadow.camera.top = 32;
dirLight.shadow.camera.bottom = -32;
scene.add(dirLight);

// Контурный свет (Rim Light) для выделения силуэтов дронов и стен
const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.38);
rimLight.position.set(-34, 26, -30);
scene.add(rimLight);

// Ресайз окна
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        if (renderer) {
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }
    });
}

/**
 * Объединение нескольких Three.js BufferGeometry в один меш для снижения Draw Calls.
 * Поддерживает { geometry, matrix }, THREE.BufferGeometry и THREE.Mesh.
 * Корректно объединяет position, normal, uv и индексы.
 */
function mergeBufferGeometries(items) {
    if (!items || items.length === 0) return new THREE.BufferGeometry();
    if (items.length === 1 && !items[0].matrix) {
        return items[0].geometry ? items[0].geometry.clone() : items[0].clone();
    }

    const prepared = items.map(item => {
        let geo, matrix;
        if (item.isBufferGeometry) {
            geo = item;
        } else if (item.isMesh) {
            geo = item.geometry;
            matrix = item.matrix;
        } else {
            geo = item.geometry;
            matrix = item.matrix;
        }
        return { geo, matrix };
    });

    const hasAnyIndex = prepared.some(p => !!p.geo.index);
    const allIndexed = prepared.every(p => !!p.geo.index);
    const shouldBeIndexed = allIndexed;

    let totalVertices = 0;
    let totalIndices = 0;
    const processed = prepared.map(({ geo, matrix }) => {
        let g = geo;
        if (hasAnyIndex && !shouldBeIndexed && g.index) {
            g = g.toNonIndexed();
        } else {
            g = g.clone();
        }
        if (matrix) {
            g.applyMatrix4(matrix);
        }
        totalVertices += g.attributes.position.count;
        if (shouldBeIndexed && g.index) {
            totalIndices += g.index.count;
        }
        return g;
    });

    const merged = new THREE.BufferGeometry();
    const posArray = new Float32Array(totalVertices * 3);
    const hasNormals = processed.every(g => !!g.attributes.normal);
    const normArray = hasNormals ? new Float32Array(totalVertices * 3) : null;
    const hasUv = processed.every(g => !!g.attributes.uv);
    const uvArray = hasUv ? new Float32Array(totalVertices * 2) : null;

    let posOffset = 0;
    let uvOffset = 0;
    let indexOffset = 0;
    let vertexBase = 0;
    let indexArray = shouldBeIndexed ? (totalVertices > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices)) : null;

    for (let i = 0; i < processed.length; i++) {
        const g = processed[i];
        const count = g.attributes.position.count;
        posArray.set(g.attributes.position.array, posOffset * 3);
        if (hasNormals && g.attributes.normal) {
            normArray.set(g.attributes.normal.array, posOffset * 3);
        }
        if (hasUv && g.attributes.uv) {
            uvArray.set(g.attributes.uv.array, uvOffset * 2);
            uvOffset += count;
        }
        if (shouldBeIndexed && g.index) {
            const idx = g.index.array;
            for (let j = 0; j < idx.length; j++) {
                indexArray[indexOffset + j] = idx[j] + vertexBase;
            }
            indexOffset += g.index.count;
        }
        posOffset += count;
        vertexBase += count;
    }

    merged.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    if (normArray) merged.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
    if (uvArray) merged.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    if (indexArray) merged.setIndex(new THREE.BufferAttribute(indexArray, 1));

    return merged;
}

if (typeof window !== 'undefined') window.mergeBufferGeometries = mergeBufferGeometries;
if (typeof module !== 'undefined' && module.exports) module.exports.mergeBufferGeometries = mergeBufferGeometries;

