// =============================================================================
// js/minimap.js — Миникарта (с оффскрин-кэшированием препятствий и метками юнитов)
// =============================================================================

const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const MINIMAP_PX = minimapCanvas.width;

const staticMinimapCanvas = document.createElement('canvas');
staticMinimapCanvas.width = MINIMAP_PX;
staticMinimapCanvas.height = MINIMAP_PX;
const staticMinimapCtx = staticMinimapCanvas.getContext('2d');

function initStaticMinimap() {
    staticMinimapCtx.fillStyle = '#05070d';
    staticMinimapCtx.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);

    staticMinimapCtx.fillStyle = '#2b395c';
    // Клетка стены на миникарте: ровно размер клетки сетки (минимум 1 px). Фиксированные 3 px
    // на картах 512 и 1024 (клетка 1.3 и 0.66 px) сливали стены в сплошное пятно.
    const cellPx = Math.max(1, MINIMAP_PX / GRID_SIZE);
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const isHQCell = (r === HQ_ROW && c === HQ_COL) || (r === ENEMY_HQ_ROW && c === ENEMY_HQ_COL);
            if (grid[r][c] === 1 && !isHQCell) {
                const wp = gridToWorld(c, r);
                const mx = ((wp.x + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
                const my = ((wp.z + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
                staticMinimapCtx.fillRect(mx - cellPx * 0.5, my - cellPx * 0.5, cellPx, cellPx);
            }
        }
    }
}
initStaticMinimap();

// Возвращает один и тот же объект (результат нужно использовать сразу): миникарта рисуется каждый кадр,
// и новый объект на каждый юнит давал тысячи аллокаций в кадр на больших армиях
const _minimapPoint = { mx: 0, my: 0 };
function worldToMinimap(x, z) {
    _minimapPoint.mx = ((x + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
    _minimapPoint.my = ((z + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
    return _minimapPoint;
}

function updateMinimap() {
    minimapCtx.drawImage(staticMinimapCanvas, 0, 0);

    // Штабы
    const hqMarkerSize = 7;
    if (playerHQ && playerHQ.mesh) {
        const pPos = worldToMinimap(playerHQ.mesh.position.x, playerHQ.mesh.position.z);
        minimapCtx.fillStyle = playerHQ.hp > 0 ? '#00ffcc' : '#555555';
        minimapCtx.fillRect(pPos.mx - hqMarkerSize * 0.5, pPos.my - hqMarkerSize * 0.5, hqMarkerSize, hqMarkerSize);
    }

    if (enemyHQ && enemyHQ.mesh) {
        const ePos = worldToMinimap(enemyHQ.mesh.position.x, enemyHQ.mesh.position.z);
        minimapCtx.fillStyle = enemyHQ.hp > 0 ? '#ff3333' : '#555555';
        minimapCtx.fillRect(ePos.mx - hqMarkerSize * 0.5, ePos.my - hqMarkerSize * 0.5, hqMarkerSize, hqMarkerSize);
    }

    // Точки сбора ресурсов
    for (let i = 0; i < resourceNodes.length; i++) {
        const node = resourceNodes[i];
        const pos = worldToMinimap(node.pos.x, node.pos.z);
        let col = '#ffaa00';
        if (node.owner === 'player') col = '#00ffcc';
        else if (node.owner === 'enemy') col = '#ff3333';

        minimapCtx.fillStyle = col;
        minimapCtx.strokeStyle = '#ffffff';
        minimapCtx.lineWidth = 1;
        const sz = 4.5;
        minimapCtx.beginPath();
        minimapCtx.moveTo(pos.mx, pos.my - sz);
        minimapCtx.lineTo(pos.mx + sz, pos.my);
        minimapCtx.lineTo(pos.mx, pos.my + sz);
        minimapCtx.lineTo(pos.mx - sz, pos.my);
        minimapCtx.closePath();
        minimapCtx.fill();
        minimapCtx.stroke();
    }

    // Союзники
    minimapCtx.fillStyle = '#00ffcc';
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.hp <= 0) continue;
        const pos = worldToMinimap(u.mesh.position.x, u.mesh.position.z);
        const sz = u.type === 'tank' ? 3.0 : (u.type === 'scout' ? 1.8 : 2.4);
        minimapCtx.beginPath();
        minimapCtx.arc(pos.mx, pos.my, sz, 0, Math.PI * 2);
        minimapCtx.fill();
    }

    // Враги
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.hp <= 0) continue;
        const pos = worldToMinimap(e.mesh.position.x, e.mesh.position.z);

        if (e.type === 'boss') {
            // Крупный маркер босса с сияющей каймой
            minimapCtx.fillStyle = '#ff0055';
            minimapCtx.beginPath();
            minimapCtx.arc(pos.mx, pos.my, 5.0, 0, Math.PI * 2);
            minimapCtx.fill();
            minimapCtx.strokeStyle = '#00d4ff';
            minimapCtx.lineWidth = 1.5;
            minimapCtx.stroke();
        } else if (e.type === 'tank') {
            minimapCtx.fillStyle = '#ff2222';
            minimapCtx.beginPath();
            minimapCtx.arc(pos.mx, pos.my, 3.2, 0, Math.PI * 2);
            minimapCtx.fill();
        } else if (e.type === 'scout') {
            minimapCtx.fillStyle = '#ff6666';
            minimapCtx.beginPath();
            minimapCtx.arc(pos.mx, pos.my, 1.8, 0, Math.PI * 2);
            minimapCtx.fill();
        } else {
            minimapCtx.fillStyle = '#ff3333';
            minimapCtx.beginPath();
            minimapCtx.arc(pos.mx, pos.my, 2.4, 0, Math.PI * 2);
            minimapCtx.fill();
        }
    }

    // Рамка обзора камеры: проекция четырёх углов экрана на плоскость земли (трапеция).
    // Раньше рисовался квадрат 32×32 из времён карты 44×44 — он был в несколько раз меньше видимого поля.
    minimapCtx.strokeStyle = 'rgba(255,255,255,0.6)';
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    let frameOk = true;
    for (let i = 0; i < 4; i++) {
        if (!screenCornerToGround(VIEW_CORNERS[i][0], VIEW_CORNERS[i][1], _viewCorner)) { frameOk = false; break; }
        const mx = ((_viewCorner.x + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
        const my = ((_viewCorner.z + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
        if (i === 0) minimapCtx.moveTo(mx, my);
        else minimapCtx.lineTo(mx, my);
    }
    if (frameOk) {
        minimapCtx.closePath();
        minimapCtx.stroke();
    }
}

// Углы экрана в NDC по часовой стрелке
const VIEW_CORNERS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
const _viewCorner = new THREE.Vector3();
const _viewDir = new THREE.Vector3();

// Точка на земле (y = 0) под углом экрана; false, если луч уходит выше горизонта
function screenCornerToGround(ndcX, ndcY, out) {
    _viewDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position);
    if (_viewDir.y >= -1e-6) return false;
    const k = -camera.position.y / _viewDir.y;
    out.set(camera.position.x + _viewDir.x * k, 0, camera.position.z + _viewDir.z * k);
    return true;
}

function jumpCameraFromMinimapEvent(clientX, clientY) {
    const rect = minimapCanvas.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width * MINIMAP_PX;
    const py = (clientY - rect.top) / rect.height * MINIMAP_PX;
    camPivot.x = (px / MINIMAP_PX) * MAP_WORLD_SIZE - MAP_WORLD_SIZE * 0.5;
    camPivot.z = (py / MINIMAP_PX) * MAP_WORLD_SIZE - MAP_WORLD_SIZE * 0.5;
    if (typeof clampCameraBounds === 'function') clampCameraBounds();
    else applyCameraTransform();
}

minimapCanvas.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    jumpCameraFromMinimapEvent(e.clientX, e.clientY);
});
minimapCanvas.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    if (e.touches.length === 1) jumpCameraFromMinimapEvent(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
