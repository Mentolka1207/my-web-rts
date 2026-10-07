// =============================================================================
// js/ui.js — Интерфейс пользователя, тактические оповещения, меню и победа/поражение
// =============================================================================

let gameStarted = false;
let gameOver = false;
const HUD_PANEL_IDS = ['instructions', 'resource-panel', 'wave-panel', 'minimap-wrap', 'touch-mode-panel'];

function startGame() {
    const menuEl = document.getElementById('main-menu-overlay');
    if (menuEl) menuEl.style.display = 'none';
    HUD_PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    });
    gameStarted = true;
    if (typeof matchStats !== 'undefined') matchStats.startTime = performance.now();
    updateResourceUI();
    updateWaveUI();
}

function exitGame() {
    window.close();
    setTimeout(() => {
        const btn = document.getElementById('exit-btn');
        if (btn) btn.textContent = 'Закройте вкладку вручную (браузер блокирует автозакрытие)';
    }, 300);
}

function toggleInstructions() {
    const content = document.getElementById('instructions-content');
    const btn = document.getElementById('instructions-toggle');
    if (!content || !btn) return;
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? 'Скрыть ▲' : 'Управление ▼';
}

// Тактические всплывающие оповещения (неоновые баннеры)
let alertTimeout = null;
function showTacticalAlert(text, isDanger = false) {
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
        titleEl.textContent = playerWon ? '🏆 ПОБЕДА!' : '💥 ПОРАЖЕНИЕ';
        titleEl.style.color = playerWon ? '#00ffcc' : '#ff3333';
    }

    if (statsEl && typeof matchStats !== 'undefined') {
        const durationSec = Math.max(0, Math.floor((performance.now() - (matchStats.startTime || performance.now())) / 1000));
        const mm = Math.floor(durationSec / 60).toString().padStart(2, '0');
        const ss = (durationSec % 60).toString().padStart(2, '0');
        const timeStr = `${mm}:${ss}`;

        statsEl.innerHTML = `
            <div class="stat-row"><span class="stat-label">⏱️ Время боя:</span><span class="stat-val">${timeStr}</span></div>
            <div class="stat-row"><span class="stat-label">🌊 Отражено волн:</span><span class="stat-val">${waveNumber}</span></div>
            <div class="stat-row"><span class="stat-label">💥 Уничтожено врагов:</span><span class="stat-val">${matchStats.enemiesKilled}</span></div>
            ${matchStats.bossesKilled > 0 ? `<div class="stat-row"><span class="stat-label">👑 Сбито Левиафанов:</span><span class="stat-val" style="color:#ff3366;">${matchStats.bossesKilled}</span></div>` : ''}
            <div class="stat-row"><span class="stat-label">⚡ Добыто энергии:</span><span class="stat-val">${Math.floor(matchStats.energyHarvested)} ⚡</span></div>
            <div class="stat-row"><span class="stat-label">🛸 Произведено дронов:</span><span class="stat-val">${matchStats.unitsProduced}</span></div>
            <div class="stat-row"><span class="stat-label">💎 Захватов точек:</span><span class="stat-val">${matchStats.nodesCaptured}</span></div>
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
    }

    const fpsEl = document.getElementById('dbg-fps');
    const ftEl = document.getElementById('dbg-frame-time');
    const uEl = document.getElementById('dbg-units');
    const selEl = document.getElementById('dbg-selected');
    const dcEl = document.getElementById('dbg-draw-calls');
    const triEl = document.getElementById('dbg-triangles');
    const ffEl = document.getElementById('dbg-flowfield');

    if (fpsEl) fpsEl.textContent = currentFPS;
    if (ftEl) ftEl.textContent = (delta * 1000).toFixed(1) + ' ms';
    if (uEl) uEl.textContent = `${units.length} / ${enemies.length} (всего ${units.length + enemies.length})`;
    if (selEl) selEl.textContent = units.filter(u => u.selected && u.hp > 0).length;
    if (dcEl && typeof renderer !== 'undefined' && renderer.info) dcEl.textContent = renderer.info.render.calls;
    if (triEl && typeof renderer !== 'undefined' && renderer.info) triEl.textContent = renderer.info.render.triangles;
    if (ffEl && typeof flowFieldGen !== 'undefined') ffEl.textContent = (flowFieldGen.lastComputeTime || 0).toFixed(2) + ' ms';
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

