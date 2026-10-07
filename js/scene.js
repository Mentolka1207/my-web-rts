// =============================================================================
// js/scene.js — Three.js сцена, камера, освещение, рендерер
// =============================================================================

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d19);
scene.fog = new THREE.Fog(0x0b0d19, 60, 115);

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.52);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x88ffff, 0x161c30, 0.45);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.set(30, 60, 30);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.bias = -0.0004;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 130;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
scene.add(dirLight);

// Ресайз окна
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
