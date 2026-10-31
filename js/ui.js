// =============================================================================
// js/ui.js — Интерфейс пользователя, тактические оповещения, меню и победа/поражение
// =============================================================================

let gameStarted = false;
let gameOver = false;
let isGamePaused = false;
const HUD_PANEL_IDS = ['instructions', 'resource-panel', 'wave-panel', 'minimap-wrap', 'touch-mode-panel', 'hud-pause-btn'];

// =============================================================================
// Система модальных окон: стек, перевод фокуса, ловушка Tab, Esc, возврат фокуса.
// Пока открыто любое окно, симуляция стоит (isSimulationPaused), а игровые
// горячие клавиши не срабатывают (обработчик ниже гасит keydown в фазе захвата).
// =============================================================================
const MODAL_CLOSERS = {
    'settings-modal': () => closeSettingsModal(),
    'records-modal': () => closeRecordsModal(),
    'tutorial-modal': () => closeTutorialModal(),
    'licenses-modal': () => closeLicensesModal(),
    'pause-overlay': () => setGamePaused(false),
    'game-over-overlay': null // итог боя не закрывается по Esc: только кнопками
};
const modalStack = []; // [{ id, returnFocus }]
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isElementShown(el) {
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function getFocusable(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter(isElementShown);
}

function showModal(id, displayValue = 'flex', focusSelector = null) {
    const el = document.getElementById(id);
    if (!el) return;
    const already = modalStack.findIndex(m => m.id === id);
    if (already !== -1) modalStack.splice(already, 1);
    const active = document.activeElement;
    modalStack.push({ id, returnFocus: (active && active !== document.body) ? active : null });
    el.style.display = displayValue;
    const target = (focusSelector && el.querySelector(focusSelector)) || getFocusable(el)[0];
    if (target) target.focus({ preventScroll: true });
}

function hideModal(id, restoreFocus = true) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
    const idx = modalStack.findIndex(m => m.id === id);
    if (idx === -1) return;
    const [entry] = modalStack.splice(idx, 1);
    if (restoreFocus && entry.returnFocus && isElementShown(entry.returnFocus)) {
        entry.returnFocus.focus({ preventScroll: true });
    }
}

// Закрыть все окна без возврата фокуса (рестарт, выход в меню)
function hideAllModals() {
    while (modalStack.length) hideModal(modalStack[modalStack.length - 1].id, false);
}

function topModalId() {
    return modalStack.length ? modalStack[modalStack.length - 1].id : null;
}

function isAnyModalOpen() {
    return modalStack.length > 0;
}

// Симуляция стоит на паузе и при открытом окне (например, обучение в начале первого матча)
function isSimulationPaused() {
    return isGamePaused || modalStack.length > 0;
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (e) => {
        const id = topModalId();
        if (!id) return;
        const el = document.getElementById(id);
        if (!el) return;

        if (e.key === 'Escape' || (id === 'pause-overlay' && e.code === 'KeyP')) {
            e.preventDefault();
            e.stopPropagation();
            const close = MODAL_CLOSERS[id];
            if (close) close();
            return;
        }

        if (e.key === 'Tab') {
            const items = getFocusable(el);
            if (items.length === 0) { e.preventDefault(); return; }
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
                e.preventDefault(); first.focus();
            }
        }
        // Остальные клавиши не уходят в игру (WASD, Q/E/R, F3, ` и т. д.)
        e.stopPropagation();
    }, true);
}

function startGame() {
    const menuEl = document.getElementById('main-menu-overlay');
    if (menuEl) menuEl.style.display = 'none';
    HUD_PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
    // На узком экране и на таче инструкции свёрнуты, чтобы не закрывать поле
    setInstructionsExpanded(!isCompactViewport());
    // Фокус уходит с исчезнувшей кнопки «Играть» на первую кнопку HUD
    const hudFirst = document.getElementById('instructions-toggle');
    if (hudFirst) hudFirst.focus({ preventScroll: true });

    // Применяем выбранную карту при старте матча
    if (typeof applyMapToGrid === 'function' && typeof currentMapId !== 'undefined') {
        applyMapToGrid(currentMapId);
    }

    gameStarted = true;
    gameOver = false;
    isGamePaused = false;

    // Если это первый запуск игрока, показать обучающий онбординг
    if (typeof playerProfile !== 'undefined' && !playerProfile.tutorialCompleted && playerProfile.matchesPlayed === 0) {
        showTutorialModal();
    }

    if (typeof soundEngine !== 'undefined') {
        soundEngine.ensureContext();
        soundEngine.startAmbient();
        playOrderSound(false);
    }
    if (typeof matchStats !== 'undefined') matchStats.startTime = performance.now();
    updateResourceUI();
    updateWaveUI();
}

function exitGame() {
    window.close();
    setTimeout(() => {
        const btn = document.getElementById('exit-btn');
        if (btn) btn.textContent = typeof t === 'function' ? t('MENU_EXIT_NOTICE') : 'Закройте вкладку вручную (браузер блокирует автозакрытие)';
    }, 300);
}

// Подпись кнопки с иконкой: меняем только текст .btn-label, иконку не трогаем
function setButtonLabel(btn, icon, label) {
    if (!btn) return;
    const iconEl = btn.querySelector('.btn-icon');
    const labelEl = btn.querySelector('.btn-label');
    if (iconEl && icon !== null) iconEl.textContent = icon;
    if (labelEl) labelEl.textContent = label;
    else btn.textContent = label;
}

// Узкий экран или тач: инструкции по умолчанию свёрнуты, чтобы не закрывать поле
function isCompactViewport() {
    return typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function setInstructionsExpanded(expanded) {
    const content = document.getElementById('instructions-content');
    const btn = document.getElementById('instructions-toggle');
    if (!content || !btn) return;
    content.style.display = expanded ? '' : 'none';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    setButtonLabel(btn, '☰', typeof t === 'function' ? t(expanded ? 'BTN_HIDE' : 'BTN_SHOW') : (expanded ? 'Скрыть' : 'Управление'));
}

function toggleInstructions() {
    const btn = document.getElementById('instructions-toggle');
    if (!btn) return;
    setInstructionsExpanded(btn.getAttribute('aria-expanded') !== 'true');
}

// Тексты кнопок, которые зависят от состояния; вызывается и при смене языка
function refreshStatefulLabels() {
    const toggle = document.getElementById('instructions-toggle');
    if (toggle) setInstructionsExpanded(toggle.getAttribute('aria-expanded') === 'true');
    const pauseBtn = document.getElementById('hud-pause-btn');
    if (pauseBtn) setButtonLabel(pauseBtn, isGamePaused ? '▶' : '⏸️', typeof t === 'function' ? t(isGamePaused ? 'RESUME_LABEL' : 'PAUSE_LABEL') : 'Пауза');
    if (typeof refreshTouchModeButton === 'function') refreshTouchModeButton();
    if (typeof refreshProfilerToggles === 'function') refreshProfilerToggles();
    if (typeof updateBenchmarkUI === 'function') updateBenchmarkUI();
    if (typeof updateFormationUI === 'function') updateFormationUI();
    if (debugOverlayVisible) refreshAssetSizes();
}

// Управление паузой
function togglePause() {
    if (!gameStarted || gameOver) return;
    setGamePaused(!isGamePaused);
}

function setGamePaused(paused) {
    if (!gameStarted || gameOver) return;
    if (paused === isGamePaused) return;
    isGamePaused = paused;

    if (isGamePaused) showModal('pause-overlay');
    else {
        // Окна поверх паузы (настройки) закрываются вместе с ней
        while (topModalId() && topModalId() !== 'pause-overlay') hideModal(topModalId(), false);
        hideModal('pause-overlay');
    }
    refreshStatefulLabels();
}

// Авто-пауза при потере фокуса вкладки или сворачивании окна
function onVisibilityHidden() {
    if (typeof gameStarted !== 'undefined' && gameStarted && !gameOver && !isGamePaused) {
        setGamePaused(true);
    }
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) onVisibilityHidden();
    });
}
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('blur', () => {
        onVisibilityHidden();
    });
}

// Быстрый перезапуск боя без перезагрузки страницы
function restartMatch() {
    // 1. Очистка всех юнитов с Three.js сцены
    for (let i = 0; i < units.length; i++) {
        if (units[i].mesh) scene.remove(units[i].mesh);
    }
    units.length = 0;

    for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].mesh) scene.remove(enemies[i].mesh);
    }
    enemies.length = 0;

    if (typeof spatialGrid !== 'undefined') spatialGrid.clear();
    if (typeof instancedRenderer !== 'undefined') instancedRenderer.clear();
    if (typeof simWorld !== 'undefined') simWorld.clear();

    // 2. Сброс снарядов и следов
    if (typeof clearAllVFX === 'function') clearAllVFX();

    // 3. Восстановление штабов
    if (typeof playerHQ !== 'undefined' && playerHQ && playerHQ.mesh) {
        if (!playerHQ.mesh.parent) scene.add(playerHQ.mesh);
        playerHQ.hp = playerHQ.maxHp;
        updateHealthBar(playerHQ.healthBar, playerHQ.hp, playerHQ.maxHp);
    }
    if (typeof enemyHQ !== 'undefined' && enemyHQ && enemyHQ.mesh) {
        if (!enemyHQ.mesh.parent) scene.add(enemyHQ.mesh);
        enemyHQ.hp = enemyHQ.maxHp;
        updateHealthBar(enemyHQ.healthBar, enemyHQ.hp, enemyHQ.maxHp);
    }

    // 4. Сброс ресурсов и точек сбора
    energy = 100;
    energyAccumulator = 0;
    if (typeof resourceNodes !== 'undefined') {
        resourceNodes.forEach(node => {
            node.owner = 'neutral';
            node.captureProgress = 0;
            if (node.crystalMat && node.crystalMat.emissive) {
                node.crystalMat.emissive.setHex(0xffaa00);
            }
        });
    }

    // 5. Применение выбранной карты
    if (typeof applyMapToGrid === 'function' && typeof currentMapId !== 'undefined') {
        applyMapToGrid(currentMapId);
    }

    // 6. Сброс волн и статистики матча
    waveNumber = 0;
    waveTimer = (typeof getWaveInterval === 'function') ? getWaveInterval() : WAVE_INTERVAL;
    waveWarningGiven = false;

    if (typeof matchStats !== 'undefined') {
        matchStats.startTime = performance.now();
        matchStats.enemiesKilled = 0;
        matchStats.bossesKilled = 0;
        matchStats.unitsProduced = 0;
        matchStats.energyHarvested = 100;
        matchStats.nodesCaptured = 0;
    }

    // 7. Создание стартовых отрядов
    initStartingUnits();

    // 8. Сброс камеры
    camPivot.set(0, 0, 0);
    camZoomDist = BASE_CAM_DIST;
    applyCameraTransform();

    // 9. Состояния матча
    gameOver = false;
    isGamePaused = false;
    gameStarted = true;

    // 10. Скрытие оверлеев и окон
    hideAllModals();
    refreshStatefulLabels();
    const hudFirst = document.getElementById('instructions-toggle');
    if (hudFirst) hudFirst.focus({ preventScroll: true });

    // 11. Звук и интерфейс
    if (typeof soundEngine !== 'undefined') {
        soundEngine.ensureContext();
        soundEngine.startAmbient();
        playOrderSound(false);
    }
    updateResourceUI();
    updateWaveUI();
}

// Возврат в главное меню
function returnToMainMenu() {
    isGamePaused = false;
    gameStarted = false;
    gameOver = false;

    if (typeof soundEngine !== 'undefined') {
        soundEngine.stopAmbient();
    }

    HUD_PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    hideAllModals();
    const abPanel = document.getElementById('ability-panel');
    if (abPanel) abPanel.style.display = 'none';
    refreshStatefulLabels();

    const menuEl = document.getElementById('main-menu-overlay');
    if (menuEl) menuEl.style.display = 'flex';
    const playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.focus({ preventScroll: true });
}

// Тактические всплывающие оповещения (неоновые баннеры)
let alertTimeout = null;
function showTacticalAlert(text, isDanger = false) {
    if (typeof playAlertSound === 'function') playAlertSound(isDanger);
    const el = document.getElementById('tactical-alert');
    if (!el) return;
    // Тревога читается экранным диктором сразу, обычное сообщение — в паузе между репликами
    el.setAttribute('aria-live', isDanger ? 'assertive' : 'polite');
    el.classList.toggle('is-danger', !!isDanger);
    el.textContent = text;
    el.style.display = 'block';
    el.style.opacity = '1';

    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; }, 400);
    }, 4500);
}

// Завершение игры: взрыв побеждённого штаба и экран победы/поражения
function triggerGameOver(playerWon) {
    if (gameOver) return;
    gameOver = true;

    if (typeof soundEngine !== 'undefined') soundEngine.stopAmbient();
    if (typeof playGameOverSound === 'function') playGameOverSound(playerWon);

    const losingHQ = playerWon ? enemyHQ : playerHQ;
    spawnExplosion(losingHQ.mesh.position, 28);
    spawnScorch(losingHQ.mesh.position);
    scene.remove(losingHQ.mesh);

    const titleEl = document.getElementById('game-over-title');
    const overlayEl = document.getElementById('game-over-overlay');
    const statsEl = document.getElementById('game-over-stats');
    const abPanel = document.getElementById('ability-panel');
    if (abPanel) abPanel.style.display = 'none';

    if (titleEl) {
        titleEl.textContent = playerWon ? (typeof t === 'function' ? t('GAME_OVER_VICTORY') : '🏆 ПОБЕДА!') : (typeof t === 'function' ? t('GAME_OVER_DEFEAT') : '💥 ПОРАЖЕНИЕ');
        titleEl.classList.toggle('is-defeat', !playerWon);
    }

    const durationSec = Math.max(0, Math.floor((performance.now() - (matchStats.startTime || performance.now())) / 1000));
    const wavesDefeated = playerWon ? waveNumber : Math.max(0, waveNumber - 1);

    // Запись результатов в профиль
    if (typeof recordMatchResult === 'function' && typeof matchStats !== 'undefined') {
        recordMatchResult(playerWon, matchStats, durationSec, wavesDefeated);
    }

    if (statsEl && typeof matchStats !== 'undefined') {
        const mm = Math.floor(durationSec / 60).toString().padStart(2, '0');
        const ss = (durationSec % 60).toString().padStart(2, '0');
        const rows = [
            ['STAT_TIME', `${mm}:${ss}`],
            ['STAT_WAVES_DEFENDED', wavesDefeated],
            ['STAT_KILLED', matchStats.enemiesKilled],
            matchStats.bossesKilled > 0 ? ['STAT_BOSSES', matchStats.bossesKilled, 'is-neg'] : null,
            ['STAT_ENERGY', `${Math.floor(matchStats.energyHarvested)} ⚡`],
            ['STAT_PRODUCED', matchStats.unitsProduced],
            ['STAT_CAPTURES', matchStats.nodesCaptured]
        ];
        statsEl.innerHTML = renderStatList(rows, typeof t === 'function' ? t('STATS_TITLE') : 'Итоги боя');
    }

    showModal('game-over-overlay', 'flex', '#game-over-restart-btn');
}

// Список «метка — значение» как <dl>; значения — числа или короткие строки из кода, не ввод пользователя
function renderStatList(rows, ariaLabel) {
    const items = rows.filter(Boolean).map(([key, value, cls]) =>
        `<dt>${typeof t === 'function' ? t(key) : key}</dt><dd${cls ? ` class="${cls}"` : ''}>${value}</dd>`).join('');
    return `<dl class="stat-list"${ariaLabel ? ` aria-label="${ariaLabel}"` : ''}>${items}</dl>`;
}

function checkGameOverConditions() {
    if (gameOver) return;
    if (enemyHQ.hp <= 0) {
        triggerGameOver(true);
    } else if (playerHQ.hp <= 0) {
        triggerGameOver(false);
    }
}

// Модальные окна настроек, рекордов, обучения и лицензий
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    // Синхронизируем значения полей
    const masterSlider = document.getElementById('slider-master-vol');
    if (masterSlider) masterSlider.value = Math.round((playerSettings.masterVolume || 1.0) * 100);

    const sfxSlider = document.getElementById('slider-sfx-vol');
    if (sfxSlider) sfxSlider.value = Math.round((playerSettings.sfxVolume || 1.0) * 100);

    const musicSlider = document.getElementById('slider-music-vol');
    if (musicSlider) musicSlider.value = Math.round((playerSettings.musicVolume || 1.0) * 100);

    const shadowsSelect = document.getElementById('select-shadows');
    if (shadowsSelect) shadowsSelect.value = playerSettings.shadows ? 'on' : 'off';

    const langSelect = document.getElementById('select-language');
    if (langSelect) langSelect.value = currentLanguage;

    ['slider-master-vol', 'slider-sfx-vol', 'slider-music-vol'].forEach(id => {
        const input = document.getElementById(id);
        if (input) syncVolumeOutput(input, input.id.replace('slider-', 'val-'));
    });

    showModal('settings-modal');
}

// Значение ползунка: видимое «80%» и озвучиваемое aria-valuetext
function syncVolumeOutput(input, outputId) {
    const text = `${input.value}%`;
    const out = document.getElementById(outputId);
    if (out) out.textContent = text;
    input.setAttribute('aria-valuetext', text);
}

function closeSettingsModal() {
    hideModal('settings-modal');

    // Применяем настройки
    const masterSlider = document.getElementById('slider-master-vol');
    if (masterSlider && soundEngine && soundEngine.setMasterVolume) {
        const val = parseFloat(masterSlider.value) / 100;
        playerSettings.masterVolume = val;
        soundEngine.setMasterVolume(val);
    }

    const sfxSlider = document.getElementById('slider-sfx-vol');
    if (sfxSlider && soundEngine && soundEngine.setSfxVolume) {
        const val = parseFloat(sfxSlider.value) / 100;
        playerSettings.sfxVolume = val;
        soundEngine.setSfxVolume(val);
    }

    const musicSlider = document.getElementById('slider-music-vol');
    if (musicSlider && soundEngine && soundEngine.setMusicVolume) {
        const val = parseFloat(musicSlider.value) / 100;
        playerSettings.musicVolume = val;
        soundEngine.setMusicVolume(val);
    }

    const shadowsSelect = document.getElementById('select-shadows');
    if (shadowsSelect) {
        const enabled = shadowsSelect.value === 'on';
        playerSettings.shadows = enabled;
        if (typeof setShadowsEnabled === 'function') setShadowsEnabled(enabled);
    }

    const langSelect = document.getElementById('select-language');
    if (langSelect && langSelect.value !== currentLanguage) {
        setLanguage(langSelect.value);
    }

    if (typeof saveSettingsToStorage === 'function') {
        saveSettingsToStorage();
    }
}

let selectedRecordMap = 'canyon';
let selectedRecordDiff = 'normal';

function renderRecordsContent() {
    const statsContent = document.getElementById('records-content');
    if (!statsContent) return;

    const totals = (typeof playerProfile !== 'undefined' && playerProfile.totals) ? playerProfile.totals : { matchesPlayed: 0, victories: 0, defeats: 0, energyHarvested: 0, bossesKilled: 0 };
    const records = (typeof playerProfile !== 'undefined' && playerProfile.records) ? playerProfile.records : {};
    const mapRecords = records[selectedRecordMap] || {};
    const curRecord = mapRecords[selectedRecordDiff] || { wins: 0, losses: 0, bestWave: 0, maxKills: 0, fastestWinSec: null };

    const fastWinStr = curRecord.fastestWinSec !== null
        ? `${Math.floor(curRecord.fastestWinSec / 60)}:${(curRecord.fastestWinSec % 60).toString().padStart(2, '0')}`
        : '—';

    const mapOptions = [
        { id: 'canyon', label: typeof t === 'function' ? t('MAP_CANYON') : 'Каньон' },
        { id: 'arena', label: typeof t === 'function' ? t('MAP_ARENA') : 'Арена' },
        { id: 'maze', label: typeof t === 'function' ? t('MAP_MAZE') : 'Лабиринт' },
        { id: 'crossroads', label: typeof t === 'function' ? t('MAP_CROSSROADS') : 'Перекрёсток' }
    ].map(m => `<option value="${m.id}" ${m.id === selectedRecordMap ? 'selected' : ''}>${m.label}</option>`).join('');

    const diffOptions = [
        { id: 'easy', label: typeof t === 'function' ? t('DIFF_EASY') : 'Легко' },
        { id: 'normal', label: typeof t === 'function' ? t('DIFF_NORMAL') : 'Норма' },
        { id: 'hard', label: typeof t === 'function' ? t('DIFF_HARD') : 'Сложно' }
    ].map(d => `<option value="${d.id}" ${d.id === selectedRecordDiff ? 'selected' : ''}>${d.label}</option>`).join('');

    const tr = (k, fb) => (typeof t === 'function' ? t(k) : fb);
    const focusedId = document.activeElement ? document.activeElement.id : null;
    statsContent.innerHTML = `
        <h3 class="section-label">${tr('REC_TOTALS', '📊 Общая статистика')}</h3>
        ${renderStatList([
            ['REC_GAMES', totals.matchesPlayed, 'is-plain'],
            ['REC_WINS', totals.victories],
            ['REC_LOSSES', totals.defeats, 'is-neg'],
            ['REC_TOTAL_ENERGY', `${totals.energyHarvested} ⚡`, 'is-plain'],
            ['REC_TOTAL_BOSSES', totals.bossesKilled, 'is-neg']
        ])}
        <h3 class="section-label">${tr('REC_BY_MAP', '🗺️ Рекорды по картам')}</h3>
        <div class="records-filters">
            <div class="field">
                <label for="records-map-select">${tr('REC_FILTER_MAP', 'Карта:')}</label>
                <select id="records-map-select" class="menu-select" onchange="onRecordFilterChange(this.value, selectedRecordDiff)">${mapOptions}</select>
            </div>
            <div class="field">
                <label for="records-diff-select">${tr('REC_FILTER_DIFF', 'Сложность:')}</label>
                <select id="records-diff-select" class="menu-select" onchange="onRecordFilterChange(selectedRecordMap, this.value)">${diffOptions}</select>
            </div>
        </div>
        ${renderStatList([
            ['REC_BEST_WAVE', curRecord.bestWave],
            ['REC_MAX_KILLS', curRecord.maxKills, 'is-plain'],
            ['REC_WINS', curRecord.wins],
            ['REC_LOSSES', curRecord.losses, 'is-neg'],
            ['REC_FASTEST_WIN', fastWinStr, 'is-plain']
        ])}
    `;
    // Перерисовка не должна выбивать фокус из фильтра, которым пользуется игрок
    if (focusedId) {
        const again = document.getElementById(focusedId);
        if (again) again.focus({ preventScroll: true });
    }
}

function onRecordFilterChange(mapId, diffId) {
    selectedRecordMap = mapId;
    selectedRecordDiff = diffId;
    renderRecordsContent();
}

function openRecordsModal() {
    const modal = document.getElementById('records-modal');
    if (!modal) return;

    if (typeof loadProfileFromStorage === 'function') loadProfileFromStorage();
    if (typeof currentMapId !== 'undefined' && VALID_MAP_IDS.includes(currentMapId)) selectedRecordMap = currentMapId;
    if (typeof currentDifficulty !== 'undefined' && VALID_DIFFICULTIES.includes(currentDifficulty)) selectedRecordDiff = currentDifficulty;

    renderRecordsContent();
    showModal('records-modal');
}

function closeRecordsModal() {
    hideModal('records-modal');
}

function showTutorialModal() {
    showModal('tutorial-modal');
}

function closeTutorialModal() {
    hideModal('tutorial-modal');
    if (typeof playerProfile !== 'undefined') {
        playerProfile.tutorialCompleted = true;
        if (typeof saveProfileToStorage === 'function') saveProfileToStorage();
    }
}

function openLicensesModal() {
    showModal('licenses-modal');
}

function closeLicensesModal() {
    hideModal('licenses-modal');
}

// Панель отладки и производительности (Debug Overlay F3)
let debugOverlayVisible = false;
let fpsFrames = 0;
let fpsLastTime = performance.now();
let currentFPS = 60;

function toggleDebugOverlay() {
    debugOverlayVisible = !debugOverlayVisible;
    const dbgEl = document.getElementById('debug-overlay');
    if (dbgEl) dbgEl.style.display = debugOverlayVisible ? 'block' : 'none';
    if (debugOverlayVisible) {
        refreshProfilerToggles();
        refreshAssetSizes();
    }
}

// Уровень FPS → класс значения (цвет задаёт CSS)
function setLevelClass(el, level) {
    if (!el) return;
    el.classList.toggle('is-good', level === 'good');
    el.classList.toggle('is-warn', level === 'warn');
    el.classList.toggle('is-bad', level === 'bad');
}

function fpsLevel(fps) {
    return fps >= 50 ? 'good' : (fps >= 30 ? 'warn' : 'bad');
}

function formatKB(bytes) {
    return `${Math.round(bytes / 1024).toLocaleString()} KB`;
}

// Реальный вес загруженных файлов из Resource Timing API.
// Под file:// браузер не сообщает размеры (0) — тогда честно пишем «н/д».
function refreshAssetSizes() {
    const codeEl = document.getElementById('dbg-code-size');
    const threeEl = document.getElementById('dbg-three-size');
    if (!codeEl || !threeEl || typeof performance === 'undefined' || !performance.getEntriesByType) return;
    const na = typeof t === 'function' ? t('DBG_NA') : 'н/д';
    let code = 0, three = 0, unmeasured = 0, measuredJs = 0;
    performance.getEntriesByType('resource').forEach(r => {
        const size = r.decodedBodySize || 0;
        if (/\.(js|css)(\?|$)/.test(r.name)) { if (size === 0) unmeasured++; else measuredJs++; }
        if (/three(\.min)?\.js(\?|$)/.test(r.name)) three += size;
        else if (/\.(js|css)(\?|$)/.test(r.name)) code += size;
    });
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.decodedBodySize) code += nav.decodedBodySize;
    // Частичная сумма (например, только index.html под file://) хуже, чем «н/д»
    codeEl.textContent = (measuredJs > 0 && unmeasured === 0) ? formatKB(code) : na;
    threeEl.textContent = three > 0 ? formatKB(three) : na;
}

// Подписи переключателей профайлера (зависят от режима и языка)
function refreshProfilerToggles() {
    const tr = (k, fb) => (typeof t === 'function' ? t(k) : fb);
    const collBtn = document.getElementById('dbg-collision-btn');
    if (collBtn && typeof spatialGrid !== 'undefined') {
        const naive = spatialGrid.collisionMode === 'naive';
        collBtn.textContent = tr(naive ? 'DBG_COLL_NAIVE' : 'DBG_COLL_SPATIAL', '');
        collBtn.title = tr(naive ? 'DBG_COLL_NAIVE_TIP' : 'DBG_COLL_SPATIAL_TIP', '');
        collBtn.className = 'dbg-toggle-btn ' + (naive ? 'naive' : 'spatial');
        collBtn.setAttribute('aria-pressed', naive ? 'false' : 'true');
    }
    const instBtn = document.getElementById('dbg-instancing-btn');
    if (instBtn && typeof instancedRenderer !== 'undefined') {
        const on = !!instancedRenderer.enabled;
        instBtn.textContent = tr(on ? 'DBG_INST_ON' : 'DBG_INST_OFF', '');
        instBtn.title = tr(on ? 'DBG_INST_ON_TIP' : 'DBG_INST_OFF_TIP', '');
        instBtn.className = 'dbg-toggle-btn ' + (on ? 'instanced' : 'individual');
        instBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // Симуляция всегда идёт в главном потоке; воркер (js/sim_worker.js) — прототип, шаг в нём не вызывается
    const simModeEl = document.getElementById('dbg-sim-mode');
    if (simModeEl) simModeEl.textContent = tr('DBG_SIM_MAIN', 'главный поток');
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
        e.preventDefault();
        toggleDebugOverlay();
    }
});

function updateDebugOverlay(delta) {
    if (!debugOverlayVisible) return;

    fpsFrames++;
    const now = performance.now();
    if (now - fpsLastTime >= 500) {
        currentFPS = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
        fpsFrames = 0;
        fpsLastTime = now;
        if (typeof engineProfiler !== 'undefined') {
            engineProfiler.fps = currentFPS;
            engineProfiler.fpsHistory.push(currentFPS);
            if (engineProfiler.fpsHistory.length > 20) engineProfiler.fpsHistory.shift();
            engineProfiler.minFps = Math.min(...engineProfiler.fpsHistory);
            const sum = engineProfiler.fpsHistory.reduce((a, b) => a + b, 0);
            engineProfiler.avgFps = Math.round(sum / engineProfiler.fpsHistory.length);
        }
    }

    const fpsEl = document.getElementById('dbg-fps');
    const ftEl = document.getElementById('dbg-frame-time');
    const uEl = document.getElementById('dbg-units');
    const selEl = document.getElementById('dbg-selected');
    const dcEl = document.getElementById('dbg-draw-calls');
    const triEl = document.getElementById('dbg-triangles');
    const ffEl = document.getElementById('dbg-flowfield');
    const spEl = document.getElementById('dbg-spatial');
    const fsmEl = document.getElementById('dbg-fsm');
    const sndEl = document.getElementById('dbg-audio');
    const sndVoicesEl = document.getElementById('dbg-audio-voices');
    const rndEl = document.getElementById('dbg-render');
    const pairsEl = document.getElementById('dbg-pairs-tested');
    const tickEl = document.getElementById('dbg-tick-time');

    if (fpsEl) {
        fpsEl.textContent = currentFPS;
        setLevelClass(fpsEl, fpsLevel(currentFPS));
    }
    if (ftEl) ftEl.textContent = (delta * 1000).toFixed(1) + ' ms';
    if (tickEl && typeof engineProfiler !== 'undefined') {
        tickEl.textContent = (engineProfiler.totalTickTime || 0).toFixed(2) + ' ms';
    }
    if (uEl) uEl.textContent = typeof t === 'function' ? t('UNITS_TOTAL', units.length, enemies.length, units.length + enemies.length) : `${units.length} / ${enemies.length}`;
    if (selEl) selEl.textContent = units.filter(u => u.selected && u.hp > 0).length;
    if (dcEl && typeof renderer !== 'undefined' && renderer.info) dcEl.textContent = renderer.info.render.calls;
    if (triEl && typeof renderer !== 'undefined' && renderer.info) triEl.textContent = renderer.info.render.triangles.toLocaleString();

    if (typeof engineProfiler !== 'undefined') {
        if (ffEl) ffEl.textContent = (engineProfiler.flowFieldTime || 0).toFixed(2) + ' ms';
        if (spEl) spEl.textContent = (engineProfiler.spatialTime || 0).toFixed(2) + ' ms';
        if (fsmEl) fsmEl.textContent = (engineProfiler.fsmTime || 0).toFixed(2) + ' ms';
        if (sndEl) sndEl.textContent = (engineProfiler.audioTime || 0).toFixed(2) + ' ms';
        if (sndVoicesEl) sndVoicesEl.textContent = typeof t === 'function' ? t('DBG_VOICES', engineProfiler.audioVoices, engineProfiler.soundEvents) : `${engineProfiler.audioVoices} / ${engineProfiler.soundEvents}`;
        if (rndEl) rndEl.textContent = (engineProfiler.renderTime || 0).toFixed(2) + ' ms';
        if (pairsEl) {
            const numPairs = (typeof spatialGrid !== 'undefined') ? (spatialGrid.lastPairsTested || spatialGrid.pairsTested || 0) : 0;
            pairsEl.textContent = numPairs.toLocaleString();
            setLevelClass(pairsEl, (typeof spatialGrid !== 'undefined' && spatialGrid.collisionMode === 'naive') ? 'warn' : null);
        }
    }

}

// Компактная панель FPS / времени кадра / активных юнитов (клавиша ` / ~)
let perfPanelVisible = false;
let perfFrames = 0;
let perfWindowStart = 0;
let perfLastTimestamp = 0;
let perfWorstFrame = 0;
const PERF_WINDOW_MS = 500;

function togglePerfPanel() {
    perfPanelVisible = !perfPanelVisible;
    const el = document.getElementById('perf-panel');
    if (el) el.style.display = perfPanelVisible ? 'block' : 'none';
    // Сброс окна, чтобы пауза в скрытом состоянии не исказила первый замер
    perfFrames = 0;
    perfWorstFrame = 0;
    perfWindowStart = 0;
    perfLastTimestamp = 0;
}

window.addEventListener('keydown', (e) => {
    // e.code не зависит от раскладки (на русской раскладке это клавиша «Ё»)
    if (e.code === 'Backquote' && !e.repeat) {
        e.preventDefault();
        togglePerfPanel();
    }
});

// timestamp — метка requestAnimationFrame (мс), реальный интервал между кадрами без клампа дельты
function updatePerfPanel(timestamp) {
    if (!perfPanelVisible) return;

    if (perfLastTimestamp > 0) {
        const frameMs = timestamp - perfLastTimestamp;
        if (frameMs > perfWorstFrame) perfWorstFrame = frameMs;
        perfFrames++;
    }
    perfLastTimestamp = timestamp;

    if (perfWindowStart === 0) {
        perfWindowStart = timestamp;
        return;
    }
    const elapsed = timestamp - perfWindowStart;
    if (elapsed < PERF_WINDOW_MS || perfFrames === 0) return;

    const fps = Math.round((perfFrames * 1000) / elapsed);
    const avgMs = elapsed / perfFrames;

    let alliesAlive = 0;
    let enemiesAlive = 0;
    for (let i = 0; i < units.length; i++) if (units[i].hp > 0) alliesAlive++;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].hp > 0) enemiesAlive++;

    const fpsEl = document.getElementById('perf-fps');
    const ftEl = document.getElementById('perf-frame-time');
    const uEl = document.getElementById('perf-units');
    if (fpsEl) {
        fpsEl.textContent = fps;
        setLevelClass(fpsEl, fpsLevel(fps));
    }
    if (ftEl) ftEl.textContent = `${avgMs.toFixed(1)} / ${perfWorstFrame.toFixed(1)} ms`;
    if (uEl) uEl.textContent = typeof t === 'function' ? t('UNITS_TOTAL', alliesAlive, enemiesAlive, alliesAlive + enemiesAlive) : `${alliesAlive} / ${enemiesAlive}`;

    perfFrames = 0;
    perfWorstFrame = 0;
    perfWindowStart = timestamp;
}

// --- ПАНЕЛЬ АКТИВНЫХ СПОСОБНОСТЕЙ ЮНИТОВ (ACTION BAR) ---
let lastAbilityUIUpdate = 0;
function updateAbilityUI(currentTime) {
    const panel = document.getElementById('ability-panel');
    if (!panel) return;
    if (!gameStarted || gameOver) {
        panel.style.display = 'none';
        return;
    }

    const curTime = currentTime !== undefined ? currentTime : ((typeof clock !== 'undefined') ? clock.elapsedTime : performance.now() / 1000);

    // Троттлинг обновлений текста и DOM (не чаще раза в 60 мс для экономии CPU)
    if (currentTime !== undefined && (curTime - lastAbilityUIUpdate < 0.06)) return;
    lastAbilityUIUpdate = curTime;

    const sel = units.filter(u => u.selected && u.hp > 0);
    if (sel.length === 0) {
        panel.style.display = 'none';
        return;
    }

    const hasScout = sel.some(u => u.type === 'scout');
    const hasTank = sel.some(u => u.type === 'tank');
    const hasDrone = sel.some(u => u.type === 'standard');

    if (!hasScout && !hasTank && !hasDrone) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex';

    // 1. Форсаж (Разведчик)
    const btnOverdrive = document.getElementById('btn-ability-overdrive');
    const statusOverdrive = document.getElementById('status-ability-overdrive');
    if (btnOverdrive && statusOverdrive) {
        if (!hasScout) {
            btnOverdrive.style.display = 'none';
        } else {
            btnOverdrive.style.display = 'flex';
            const scouts = sel.filter(u => u.type === 'scout');
            const anyActive = scouts.some(u => u.abilityActive);
            if (anyActive) {
                const maxActiveTime = Math.max(...scouts.map(u => u.abilityTimer));
                btnOverdrive.className = 'ability-btn active';
                const actLabel = typeof t === 'function' ? t('ABILITY_ACTIVE') : 'АКТИВНО';
                statusOverdrive.textContent = `${actLabel} (${Math.max(0, maxActiveTime).toFixed(1)}s)`;
            } else {
                let minCdRem = 0;
                for (let i = 0; i < scouts.length; i++) {
                    const rem = 10.0 - (curTime - scouts[i].lastAbilityTime);
                    if (rem > minCdRem) minCdRem = rem;
                }
                if (minCdRem > 0.1) {
                    btnOverdrive.className = 'ability-btn cooldown';
                    statusOverdrive.textContent = `${minCdRem.toFixed(1)}s`;
                } else {
                    btnOverdrive.className = 'ability-btn ready';
                    statusOverdrive.textContent = typeof t === 'function' ? t('ABILITY_READY') : 'ГОТОВО';
                }
            }
        }
    }

    // 2. Осадный режим (Танк)
    const btnSiege = document.getElementById('btn-ability-siege');
    const statusSiege = document.getElementById('status-ability-siege');
    if (btnSiege && statusSiege) {
        if (!hasTank) {
            btnSiege.style.display = 'none';
        } else {
            btnSiege.style.display = 'flex';
            const tanks = sel.filter(u => u.type === 'tank');
            const anySieged = tanks.some(u => u.isSieged);
            let minCdRem = 0;
            for (let i = 0; i < tanks.length; i++) {
                const rem = 2.5 - (curTime - tanks[i].lastSiegeSwitch);
                if (rem > minCdRem) minCdRem = rem;
            }

            if (minCdRem > 0.1) {
                btnSiege.className = anySieged ? 'ability-btn active cooldown' : 'ability-btn cooldown';
                const cdLabel = typeof t === 'function' ? t('ABILITY_CD') : 'КД';
                statusSiege.textContent = `${cdLabel} (${minCdRem.toFixed(1)}s)`;
            } else if (anySieged) {
                btnSiege.className = 'ability-btn active';
                statusSiege.textContent = typeof t === 'function' ? t('ABILITY_SIEGE_ON') : 'ОСАДА (ВКЛ)';
            } else {
                btnSiege.className = 'ability-btn ready';
                statusSiege.textContent = typeof t === 'function' ? t('ABILITY_MOBILE') : 'МОБИЛЬНЫЙ';
            }
        }
    }

    // 3. Энергощит (Дрон)
    const btnShield = document.getElementById('btn-ability-shield');
    const statusShield = document.getElementById('status-ability-shield');
    if (btnShield && statusShield) {
        if (!hasDrone) {
            btnShield.style.display = 'none';
        } else {
            btnShield.style.display = 'flex';
            const drones = sel.filter(u => u.type === 'standard');
            const anyShield = drones.some(u => u.shield > 0);
            if (anyShield) {
                const maxShieldTime = Math.max(...drones.map(u => u.shieldTimer));
                btnShield.className = 'ability-btn active';
                const shieldLabel = typeof t === 'function' ? t('ALERT_SHIELD', '').replace(/[()!0-9\s]/g, '') : 'ЩИТ';
                statusShield.textContent = `${shieldLabel || 'SHIELD'} (${Math.max(0, maxShieldTime).toFixed(1)}s)`;
            } else {
                let minCdRem = 0;
                for (let i = 0; i < drones.length; i++) {
                    const rem = 12.0 - (curTime - drones[i].lastAbilityTime);
                    if (rem > minCdRem) minCdRem = rem;
                }
                if (minCdRem > 0.1) {
                    btnShield.className = 'ability-btn cooldown';
                    statusShield.textContent = `${minCdRem.toFixed(1)}s`;
                } else {
                    btnShield.className = 'ability-btn ready';
                    statusShield.textContent = typeof t === 'function' ? t('ABILITY_READY') : 'ГОТОВО';
                }
            }
        }
    }
}

