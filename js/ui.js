// =============================================================================
// js/ui.js — Интерфейс пользователя, тактические оповещения, меню и победа/поражение
// =============================================================================

let gameStarted = false;
let gameOver = false;
let isGamePaused = false;
const HUD_PANEL_IDS = ['instructions', 'resource-panel', 'wave-panel', 'minimap-wrap', 'touch-mode-panel', 'hud-pause-btn'];

function startGame() {
    const menuEl = document.getElementById('main-menu-overlay');
    if (menuEl) menuEl.style.display = 'none';
    HUD_PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });

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

function toggleInstructions() {
    const content = document.getElementById('instructions-content');
    const btn = document.getElementById('instructions-toggle');
    if (!content || !btn) return;
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? (typeof t === 'function' ? t('BTN_HIDE_INSTRUCTIONS') : 'Скрыть ▲') : (typeof t === 'function' ? t('BTN_SHOW_INSTRUCTIONS') : 'Управление ▼');
}

// Управление паузой
function togglePause() {
    if (!gameStarted || gameOver) return;
    setGamePaused(!isGamePaused);
}

function setGamePaused(paused) {
    if (!gameStarted || gameOver) return;
    isGamePaused = paused;

    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay) {
        pauseOverlay.style.display = isGamePaused ? 'flex' : 'none';
    }

    const pauseBtn = document.getElementById('hud-pause-btn');
    if (pauseBtn) {
        pauseBtn.textContent = isGamePaused ? '▶' : '⏸️';
    }
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

    // 10. Скрытие оверлеев
    const goOverlay = document.getElementById('game-over-overlay');
    if (goOverlay) goOverlay.style.display = 'none';
    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay) pauseOverlay.style.display = 'none';

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

    const goOverlay = document.getElementById('game-over-overlay');
    if (goOverlay) goOverlay.style.display = 'none';
    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay) pauseOverlay.style.display = 'none';

    const menuEl = document.getElementById('main-menu-overlay');
    if (menuEl) menuEl.style.display = 'flex';
}

// Тактические всплывающие оповещения (неоновые баннеры)
let alertTimeout = null;
function showTacticalAlert(text, isDanger = false) {
    if (typeof playAlertSound === 'function') playAlertSound(isDanger);
    const el = document.getElementById('tactical-alert');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.opacity = '1';
    el.style.borderColor = isDanger ? '#ff3333' : '#00ffcc';
    el.style.color = isDanger ? '#ff4444' : '#00ffcc';
    el.style.boxShadow = isDanger ? '0 0 30px rgba(255, 51, 51, 0.7)' : '0 0 25px rgba(0, 255, 204, 0.5)';

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
        titleEl.style.color = playerWon ? '#00ffcc' : '#ff3333';
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
        const timeStr = `${mm}:${ss}`;

        statsEl.innerHTML = `
            <div class="stat-row"><span class="stat-label">${typeof t === 'function' ? t('STAT_TIME') : '⏱️ Время боя:'}</span><span class="stat-val">${timeStr}</span></div>
            <div class="stat-row"><span class="stat-label">${typeof t === 'function' ? t('STAT_WAVES_DEFENDED') : '🌊 Отражено волн:'}</span><span class="stat-val" style="color:#00ffcc; font-weight:bold;">${wavesDefeated}</span></div>
            <div class="stat-row"><span class="stat-label">${typeof t === 'function' ? t('STAT_KILLED') : '💥 Уничтожено врагов:'}</span><span class="stat-val">${matchStats.enemiesKilled}</span></div>
            ${matchStats.bossesKilled > 0 ? `<div class="stat-row"><span class="stat-label">${typeof t === 'function' ? t('STAT_BOSSES') : '👑 Сбито Левиафанов:'}</span><span class="stat-val" style="color:#ff3366;">${matchStats.bossesKilled}</span></div>` : ''}
            <div class="stat-row"><span class="stat-label">${typeof t === 'function' ? t('STAT_ENERGY') : '⚡ Добыто энергии:'}</span><span class="stat-val">${Math.floor(matchStats.energyHarvested)} ⚡</span></div>
            <div class="stat-row"><span class="stat-label">${typeof t === 'function' ? t('STAT_PRODUCED') : '🛸 Произведено дронов:'}</span><span class="stat-val">${matchStats.unitsProduced}</span></div>
            <div class="stat-row"><span class="stat-label">${typeof t === 'function' ? t('STAT_CAPTURES') : '💎 Захватов точек:'}</span><span class="stat-val">${matchStats.nodesCaptured}</span></div>
        `;
    }

    if (overlayEl) overlayEl.style.display = 'flex';
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

    modal.style.display = 'flex';
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';

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

function openRecordsModal() {
    const modal = document.getElementById('records-modal');
    if (!modal) return;

    if (typeof loadProfileFromStorage === 'function') loadProfileFromStorage();

    const statsContent = document.getElementById('records-content');
    if (statsContent) {
        const fastWinStr = playerProfile.fastestWinSec !== null
            ? `${Math.floor(playerProfile.fastestWinSec / 60)}:${(playerProfile.fastestWinSec % 60).toString().padStart(2, '0')}`
            : '—';

        statsContent.innerHTML = `
            <div class="stat-row"><span class="stat-label">${t('REC_GAMES')}</span><span class="stat-val">${playerProfile.matchesPlayed}</span></div>
            <div class="stat-row"><span class="stat-label">${t('REC_WINS')}</span><span class="stat-val" style="color:#00ffcc;">${playerProfile.victories}</span></div>
            <div class="stat-row"><span class="stat-label">${t('REC_LOSSES')}</span><span class="stat-val" style="color:#ff4444;">${playerProfile.defeats}</span></div>
            <div class="stat-row"><span class="stat-label">${t('REC_BEST_WAVE')}</span><span class="stat-val" style="color:#00ffcc; font-weight:bold;">${playerProfile.bestWave}</span></div>
            <div class="stat-row"><span class="stat-label">${t('REC_MAX_KILLS')}</span><span class="stat-val">${playerProfile.maxEnemiesKilled}</span></div>
            <div class="stat-row"><span class="stat-label">${t('REC_FASTEST_WIN')}</span><span class="stat-val">${fastWinStr}</span></div>
        `;
    }

    modal.style.display = 'flex';
}

function closeRecordsModal() {
    const modal = document.getElementById('records-modal');
    if (modal) modal.style.display = 'none';
}

function showTutorialModal() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) modal.style.display = 'flex';
}

function closeTutorialModal() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) modal.style.display = 'none';
    if (typeof playerProfile !== 'undefined') {
        playerProfile.tutorialCompleted = true;
        if (typeof saveProfileToStorage === 'function') saveProfileToStorage();
    }
}

function openLicensesModal() {
    const modal = document.getElementById('licenses-modal');
    if (modal) modal.style.display = 'flex';
}

function closeLicensesModal() {
    const modal = document.getElementById('licenses-modal');
    if (modal) modal.style.display = 'none';
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
        fpsEl.style.color = currentFPS >= 50 ? '#00ffcc' : (currentFPS >= 30 ? '#ffaa00' : '#ff4444');
    }
    if (ftEl) ftEl.textContent = (delta * 1000).toFixed(1) + ' ms';
    if (tickEl && typeof engineProfiler !== 'undefined') {
        tickEl.textContent = (engineProfiler.totalTickTime || 0).toFixed(2) + ' ms';
    }
    if (uEl) uEl.textContent = `${units.length} / ${enemies.length} (всего ${units.length + enemies.length})`;
    if (selEl) selEl.textContent = units.filter(u => u.selected && u.hp > 0).length;
    if (dcEl && typeof renderer !== 'undefined' && renderer.info) dcEl.textContent = renderer.info.render.calls;
    if (triEl && typeof renderer !== 'undefined' && renderer.info) triEl.textContent = renderer.info.render.triangles.toLocaleString();

    if (typeof engineProfiler !== 'undefined') {
        if (ffEl) ffEl.textContent = (engineProfiler.flowFieldTime || 0).toFixed(2) + ' ms';
        if (spEl) spEl.textContent = (engineProfiler.spatialTime || 0).toFixed(2) + ' ms';
        if (fsmEl) fsmEl.textContent = (engineProfiler.fsmTime || 0).toFixed(2) + ' ms';
        if (sndEl) sndEl.textContent = (engineProfiler.audioTime || 0).toFixed(2) + ' ms';
        if (sndVoicesEl) sndVoicesEl.textContent = `${engineProfiler.audioVoices} акт. / ${engineProfiler.soundEvents} соб.`;
        if (rndEl) rndEl.textContent = (engineProfiler.renderTime || 0).toFixed(2) + ' ms';
        if (pairsEl) {
            const numPairs = (typeof spatialGrid !== 'undefined') ? (spatialGrid.lastPairsTested || spatialGrid.pairsTested || 0) : 0;
            pairsEl.textContent = numPairs.toLocaleString();
            pairsEl.style.color = (typeof spatialGrid !== 'undefined' && spatialGrid.collisionMode === 'naive') ? '#ffaa00' : '#38bdf8';
        }
    }

    const simModeEl = document.getElementById('dbg-sim-mode');
    if (simModeEl && typeof simWorkerManager !== 'undefined') {
        if (simWorkerManager.isWorkerActive) {
            simModeEl.textContent = 'Web Worker (Multi-thread)';
            simModeEl.style.color = '#00ffcc';
        } else {
            simModeEl.textContent = 'SoA Typed Arrays (Main)';
            simModeEl.style.color = '#38bdf8';
        }
    }
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
                statusOverdrive.textContent = `АКТИВНО (${Math.max(0, maxActiveTime).toFixed(1)}с)`;
            } else {
                let minCdRem = 0;
                for (let i = 0; i < scouts.length; i++) {
                    const rem = 10.0 - (curTime - scouts[i].lastAbilityTime);
                    if (rem > minCdRem) minCdRem = rem;
                }
                if (minCdRem > 0.1) {
                    btnOverdrive.className = 'ability-btn cooldown';
                    statusOverdrive.textContent = `${minCdRem.toFixed(1)}с`;
                } else {
                    btnOverdrive.className = 'ability-btn ready';
                    statusOverdrive.textContent = 'ГОТОВО';
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
                statusSiege.textContent = `КД (${minCdRem.toFixed(1)}с)`;
            } else if (anySieged) {
                btnSiege.className = 'ability-btn active';
                statusSiege.textContent = 'ОСАДА (ВКЛ)';
            } else {
                btnSiege.className = 'ability-btn ready';
                statusSiege.textContent = 'МОБИЛЬНЫЙ';
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
                statusShield.textContent = `ЩИТ (${Math.max(0, maxShieldTime).toFixed(1)}с)`;
            } else {
                let minCdRem = 0;
                for (let i = 0; i < drones.length; i++) {
                    const rem = 12.0 - (curTime - drones[i].lastAbilityTime);
                    if (rem > minCdRem) minCdRem = rem;
                }
                if (minCdRem > 0.1) {
                    btnShield.className = 'ability-btn cooldown';
                    statusShield.textContent = `${minCdRem.toFixed(1)}с`;
                } else {
                    btnShield.className = 'ability-btn ready';
                    statusShield.textContent = 'ГОТОВО';
                }
            }
        }
    }
}

