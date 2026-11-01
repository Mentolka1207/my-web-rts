// =============================================================================
// js/config.js — Глобальные константы, параметры сетки, типы юнитов и дебаггер
// =============================================================================

// --- 0. ВСТРОЕННЫЙ ДЕБАГГЕР ОШИБОК ---
function showSystemError(err, sourceInfo) {
    if (document.getElementById('sys-error-overlay')) return;
    const tr = (key, fallback, ...args) => (typeof t === 'function' ? t(key, ...args) : fallback);

    // Оформление — в style.css (#sys-error-overlay). Текст ошибки и стек вставляются как текст,
    // а не как HTML: в сообщении могут быть угловые скобки и разметка.
    const errEl = document.createElement('div');
    errEl.id = 'sys-error-overlay';
    errEl.setAttribute('role', 'alertdialog');
    errEl.setAttribute('aria-modal', 'true');
    errEl.setAttribute('aria-labelledby', 'sys-error-title');
    errEl.setAttribute('aria-describedby', 'sys-error-message');

    const title = document.createElement('h2');
    title.id = 'sys-error-title';
    title.textContent = tr('ERR_TITLE', '🚨 Сбой в коде игры');

    const message = document.createElement('p');
    message.id = 'sys-error-message';
    message.textContent = (err && err.message) || String(err) || tr('ERR_UNKNOWN', 'Неизвестная ошибка');
    errEl.append(title, message);

    if (err && err.stack) {
        const pre = document.createElement('pre');
        pre.tabIndex = 0; // прокручиваемая область должна быть доступна с клавиатуры
        pre.textContent = err.stack;
        errEl.appendChild(pre);
    }
    if (sourceInfo) {
        const src = document.createElement('p');
        src.className = 'sys-error-source';
        src.textContent = tr('ERR_SOURCE', 'Где: ' + sourceInfo, sourceInfo);
        errEl.appendChild(src);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-danger';
    closeBtn.textContent = tr('BTN_CLOSE', 'Закрыть');
    const previousFocus = document.activeElement;
    const close = () => {
        errEl.remove();
        if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    };
    closeBtn.addEventListener('click', close);
    errEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    errEl.appendChild(closeBtn);

    document.body.appendChild(errEl);
    closeBtn.focus({ preventScroll: true });
}

window.addEventListener('error', function(e) {
    // Игнорируем анонимные сторонние события расширений браузера (CORS-маскированный "Script error." без стека и файла)
    const isAnonymousScriptError = (!e.filename || e.filename === 'script' || e.lineno === 0) &&
                                  (!e.error || !e.error.stack) &&
                                  (e.message === 'Script error.' || !e.message);
    if (isAnonymousScriptError) {
        console.warn('[RTS Debugger] Игнорировано внешнее событие Script error (расширение браузера или сторонний скрипт):', e);
        return;
    }

    const err = e.error || new Error(e.message || 'Ошибка выполнения');
    const file = e.filename ? e.filename.split('/').pop() : 'script';
    showSystemError(err, `${file} [${e.lineno}:${e.colno}]`);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('[RTS Debugger] Необработанное исключение Promise:', e.reason);
    if (e.reason) {
        showSystemError(e.reason, 'Promise rejection');
    }
});

// --- ПОЛИФИЛЛ ПЛАВНОГО ИНТЕРПОЛИРОВАНИЯ УГЛОВ (КРАТЧАЙШАЯ ДУГА) ---
function lerpAngle(start, end, t) {
    let diff = (end - start) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const clampedT = t < 0 ? 0 : (t > 1 ? 1 : t);
    return start + diff * clampedT;
}

if (typeof THREE !== 'undefined') {
    if (!THREE.MathUtils) THREE.MathUtils = {};
    if (!THREE.MathUtils.lerpAngle) {
        THREE.MathUtils.lerpAngle = lerpAngle;
    }
}

// --- СТАТИСТИКА МАТЧА (MATCH STATS) ---
const matchStats = {
    startTime: 0,
    enemiesKilled: 0,
    bossesKilled: 0,
    unitsProduced: 0,
    energyHarvested: 100,
    nodesCaptured: 0
};

// --- ПЕРЕИСПОЛЬЗУЕМЫЕ ВРЕМЕННЫЕ ПЕРЕМЕННЫЕ (ZERO-ALLOCATION) ---
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _projVec = new THREE.Vector3();

// --- НАСТРОЙКИ СЕТКИ И КАРТЫ ---
let GRID_SIZE = 22;
let CELL_SIZE = 2;
let MAP_WORLD_SIZE = GRID_SIZE * CELL_SIZE;

// Пресеты размеров карт: 256x256, 512x512, 1024x1024
const MAP_SIZE_CONFIGS = {
    '256': {
        id: '256',
        nameKey: 'MAP_SIZE_256',
        worldSize: 256,
        gridSize: 64,
        cellSize: 4,
        baseCamDist: 85,
        minCameraDist: 22,
        maxCameraDist: 220,
        fogNear: 160,
        fogFar: 380,
        extraNodes: [
            { id: 'gamma', nameKey: 'NODE_GAMMA', u: 0.25, v: 0.5 },
            { id: 'delta', nameKey: 'NODE_DELTA', u: 0.75, v: 0.5 }
        ]
    },
    '512': {
        id: '512',
        nameKey: 'MAP_SIZE_512',
        worldSize: 512,
        gridSize: 128,
        cellSize: 4,
        baseCamDist: 155,
        minCameraDist: 30,
        maxCameraDist: 440,
        fogNear: 280,
        fogFar: 720,
        extraNodes: [
            { id: 'gamma',   nameKey: 'NODE_GAMMA',   u: 0.25, v: 0.5 },
            { id: 'delta',   nameKey: 'NODE_DELTA',   u: 0.75, v: 0.5 },
            { id: 'epsilon', nameKey: 'NODE_EPSILON', u: 0.5,  v: 0.25 },
            { id: 'zeta',    nameKey: 'NODE_ZETA',    u: 0.5,  v: 0.75 }
        ]
    },
    '1024': {
        id: '1024',
        nameKey: 'MAP_SIZE_1024',
        worldSize: 1024,
        gridSize: 256,
        cellSize: 4,
        baseCamDist: 270,
        minCameraDist: 45,
        maxCameraDist: 850,
        fogNear: 550,
        fogFar: 1450,
        extraNodes: [
            { id: 'gamma',   nameKey: 'NODE_GAMMA',   u: 0.22, v: 0.5 },
            { id: 'delta',   nameKey: 'NODE_DELTA',   u: 0.78, v: 0.5 },
            { id: 'epsilon', nameKey: 'NODE_EPSILON', u: 0.5,  v: 0.22 },
            { id: 'zeta',    nameKey: 'NODE_ZETA',    u: 0.5,  v: 0.78 },
            { id: 'eta',     nameKey: 'NODE_ETA',     u: 0.28, v: 0.28 },
            { id: 'theta',   nameKey: 'NODE_THETA',   u: 0.72, v: 0.72 }
        ]
    }
};

// База союзников
let BASE_COL = 3;
let BASE_ROW = 3;

// Штабы
let HQ_COL = 1;
let HQ_ROW = 1;
let ENEMY_HQ_COL = GRID_SIZE - 2; // 20
let ENEMY_HQ_ROW = GRID_SIZE - 2; // 20

// Стратегические точки сбора ресурсов (энергетические кристаллы)
let RESOURCE_NODE_COORDS = [
    { col: 16, row: 5,  name: 'Альфа' },
    { col: 11, row: 11, name: 'Центр' },
    { col: 5,  row: 16, name: 'Бета' }
];
const RESOURCE_CORE_RADIUS = 1.35;

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

// Ограничения волн и лимиты для предотвращения падения производительности
const MAX_WAVE_SIZE = 25;
const MAX_ACTIVE_ENEMIES = 50;

