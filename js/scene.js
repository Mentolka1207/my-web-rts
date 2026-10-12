// =============================================================================
// js/scene.js — Three.js сцена, камера, освещение, рендерер
// =============================================================================

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090c16);
scene.fog = new THREE.Fog(0x090c16, 65, 125);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
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

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Кинематографичный Tone Mapping и улучшенные мягкие тени
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

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
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
