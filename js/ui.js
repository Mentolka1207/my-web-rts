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
    if (titleEl) {
        titleEl.textContent = playerWon ? '🏆 ПОБЕДА!' : '💥 ПОРАЖЕНИЕ';
        titleEl.style.color = playerWon ? '#00ffcc' : '#ff3333';
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
