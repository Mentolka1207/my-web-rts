// =============================================================================
// js/config.js — Глобальные константы, параметры сетки, типы юнитов и дебаггер
// =============================================================================

// --- 0. ВСТРОЕННЫЙ ДЕБАГГЕР ОШИБОК ---
window.addEventListener('error', function(e) {
    const errEl = document.createElement('div');
    errEl.style.position = 'absolute';
    errEl.style.top = '50%';
    errEl.style.left = '50%';
    errEl.style.transform = 'translate(-50%, -50%)';
    errEl.style.background = 'rgba(220, 38, 38, 0.95)';
    errEl.style.color = 'white';
    errEl.style.padding = '24px';
    errEl.style.borderRadius = '12px';
    errEl.style.zIndex = '9999';
    errEl.style.fontFamily = 'monospace';
    errEl.style.fontSize = '14px';
    errEl.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    errEl.style.maxWidth = '80vw';
    errEl.style.whiteSpace = 'pre-wrap';
    errEl.innerHTML = `<strong>🚨 Системный сбой JS-кода:</strong><br><br>${e.message}<br><br><span style="color: #fecaca;">Файл: ${e.filename ? e.filename.split('/').pop() : 'script'}<br>Строка: ${e.lineno}:${e.colno}</span>`;
    document.body.appendChild(errEl);
});

// --- ПЕРЕИСПОЛЬЗУЕМЫЕ ВРЕМЕННЫЕ ПЕРЕМЕННЫЕ (ZERO-ALLOCATION) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _projVec = new THREE.Vector3();

// --- НАСТРОЙКИ СЕТКИ И КАРТЫ ---
const GRID_SIZE = 22;
const CELL_SIZE = 2;
const MAP_WORLD_SIZE = GRID_SIZE * CELL_SIZE;

// База союзников
const BASE_COL = 3;
const BASE_ROW = 3;

// Штабы
const HQ_COL = 1;
const HQ_ROW = 1;
const ENEMY_HQ_COL = GRID_SIZE - 2; // 20
const ENEMY_HQ_ROW = GRID_SIZE - 2; // 20

// Стратегические точки сбора ресурсов (энергетические кристаллы)
const RESOURCE_NODE_COORDS = [
    { col: 16, row: 5,  name: 'Альфа' },
    { col: 11, row: 11, name: 'Центр' },
    { col: 5,  row: 16, name: 'Бета' }
];

// FSM Состояния юнитов
const States = {
    IDLE:   'IDLE',
    MOVE:   'MOVE',
    CHASE:  'CHASE',
    ATTACK: 'ATTACK'
};

// Характеристики союзных юнитов
const DRONE_TYPES = {
    standard: { label: 'Дрон',      cost: 70,  hp: 100, speed: 6.0,  radius: 0.45,  scale: 1.0, damage: 15, attackRange: 4.0, attackCooldown: 1.0, visionRange: 8.0 },
    scout:    { label: 'Разведчик', cost: 40,  hp: 55,  speed: 12.0, radius: 0.225, scale: 0.5, damage: 6,  attackRange: 4.0, attackCooldown: 1.0, visionRange: 9.0 },
    tank:     { label: 'Танк',      cost: 150, hp: 220, speed: 3.0,  radius: 0.63,  scale: 1.4, damage: 45, attackRange: 4.0, attackCooldown: 1.6, visionRange: 7.0 }
};

// Характеристики вражеских юнитов
const ENEMY_TYPES = {
    standard: { label: 'Штурмовик', hp: 85,  speed: 4.5, radius: 0.45, scale: 1.0,  damage: 12, attackRange: 3.8, attackCooldown: 1.1, visionRange: 7.5, reward: 10 },
    scout:    { label: 'Разведчик', hp: 50,  speed: 8.5, radius: 0.28, scale: 0.55, damage: 6,  attackRange: 4.2, attackCooldown: 0.75, visionRange: 9.5, reward: 8 },
    tank:     { label: 'Танк',      hp: 240, speed: 2.6, radius: 0.65, scale: 1.4,  damage: 35, attackRange: 4.5, attackCooldown: 1.8, visionRange: 7.0, reward: 25 },
    boss:     { label: 'Левиафан',  hp: 600, shield: 400, maxShield: 400, speed: 1.8, radius: 1.4, scale: 2.4, damage: 38, attackRange: 6.5, attackCooldown: 1.4, visionRange: 10.5, reward: 100 }
};
