// =============================================================================
// tests/helpers/loadGame.js — Загрузка браузерных скриптов игры в изолированный
// vm-контекст. Исходники js/*.js — обычные <script> без экспортов, поэтому они
// выполняются как есть (в порядке подключения из index.html), а нужные
// top-level привязки (const/class/function) достаются отдельным выражением.
// =============================================================================

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function runFile(ctx, relPath) {
    const filename = path.join(ROOT, relPath);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), ctx, { filename });
}

// Создаёт «страницу» с загруженными config/prng/grid/flowfield и возвращает
// публичные привязки. Каждый вызов даёт полностью независимое состояние
// (свой globalGridRevision, своя сетка).
function loadGame() {
    const ctx = vm.createContext({
        console,
        performance,
        // config.js навешивает глобальные обработчики ошибок
        window: { addEventListener() {} },
        // formations.js ищет кнопки построений и откладывает их подсветку таймером
        document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
        setTimeout: () => 0
    });
    ctx.globalThis = ctx;

    vm.runInContext(
        fs.readFileSync(path.join(ROOT, 'libs', 'three.min.js'), 'utf8') + ';globalThis.THREE = THREE;',
        ctx,
        { filename: path.join(ROOT, 'libs', 'three.min.js') }
    );

    runFile(ctx, 'js/config.js');
    runFile(ctx, 'js/prng.js');
    runFile(ctx, 'js/grid.js');
    runFile(ctx, 'js/spatialhash.js');
    runFile(ctx, 'js/formations.js');
    runFile(ctx, 'js/flowfield.js');

    const game = vm.runInContext(`({
        THREE,
        GRID_SIZE, CELL_SIZE, MAP_WORLD_SIZE,
        HQ_COL, HQ_ROW, ENEMY_HQ_COL, ENEMY_HQ_ROW, RESOURCE_NODE_COORDS,
        grid, worldToGrid, gridToWorld, hasLineOfSight, findBypassDirection,
        FlowFieldGenerator, invalidateFlowFieldCache,
        flowFieldGen, enemyFlowFieldGen,
        SpatialGrid, spatialGrid,
        SPACING, getFormationOffsets, setFormation, updateFormationUI,
        getCurrentFormation: () => currentFormation
    })`, ctx);
    // Сам глобальный объект «страницы»: позволяет подменять document, playSelectSound и т.п.
    game.context = ctx;
    return game;
}

// Заполняет левый-верхний фрагмент глобальной сетки по ASCII-схеме
// ('#' — стена, любой другой символ — свободная клетка). Остальные клетки
// сетки очищаются, чтобы случайные препятствия карты не влияли на тест.
function setGrid(game, rows) {
    const { grid, GRID_SIZE } = game;
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) grid[r][c] = 0;
    }
    rows.forEach((line, r) => {
        [...line].forEach((ch, c) => { grid[r][c] = ch === '#' ? 1 : 0; });
    });
    return { width: rows.length ? rows[0].length : 0, height: rows.length };
}

// Строит FlowFieldGenerator по ASCII-схеме и сразу считает поле к цели.
// Схема читается как [row][col]; цель задаётся (col, row).
function buildField(game, rows, target) {
    const { width, height } = setGrid(game, rows);
    const gen = new game.FlowFieldGenerator(width, height, game.CELL_SIZE);
    if (target) gen.updateTarget(target.col, target.row);
    return gen;
}

// Плоский вид integration-поля в виде обычного массива (типизированные массивы
// из vm-контекста — другой realm, поэтому сравниваем через Array.from).
function integrationRows(gen) {
    return gen.integrationField.map(row => Array.from(row));
}

module.exports = { loadGame, setGrid, buildField, integrationRows };
