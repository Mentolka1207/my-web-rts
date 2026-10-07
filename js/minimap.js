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
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const isHQCell = (r === HQ_ROW && c === HQ_COL) || (r === ENEMY_HQ_ROW && c === ENEMY_HQ_COL);
            if (grid[r][c] === 1 && !isHQCell) {
                const wp = gridToWorld(c, r);
                const mx = ((wp.x + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
                const my = ((wp.z + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX;
                staticMinimapCtx.fillRect(mx - 1.5, my - 1.5, 3, 3);
            }
        }
    }
}
initStaticMinimap();

function worldToMinimap(x, z) {
    return {
        mx: ((x + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX,
        my: ((z + MAP_WORLD_SIZE * 0.5) / MAP_WORLD_SIZE) * MINIMAP_PX
    };
}

function updateMinimap() {
    minimapCtx.drawImage(staticMinimapCanvas, 0, 0);

    // Штабы
    const hqMarkerSize = 7;
    const pPos = worldToMinimap(playerHQ.mesh.position.x, playerHQ.mesh.position.z);
    minimapCtx.fillStyle = playerHQ.hp > 0 ? '#00ffcc' : '#555555';
    minimapCtx.fillRect(pPos.mx - hqMarkerSize * 0.5, pPos.my - hqMarkerSize * 0.5, hqMarkerSize, hqMarkerSize);

    const ePos = worldToMinimap(enemyHQ.mesh.position.x, enemyHQ.mesh.position.z);
    minimapCtx.fillStyle = enemyHQ.hp > 0 ? '#ff3333' : '#555555';
    minimapCtx.fillRect(ePos.mx - hqMarkerSize * 0.5, ePos.my - hqMarkerSize * 0.5, hqMarkerSize, hqMarkerSize);

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

    // Рамка обзора камеры
    const viewHalf = (camZoomDist / BASE_CAM_DIST) * 16;
    const center = worldToMinimap(camPivot.x, camPivot.z);
    const halfPx = (viewHalf / MAP_WORLD_SIZE) * MINIMAP_PX;
    minimapCtx.strokeStyle = 'rgba(255,255,255,0.6)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(center.mx - halfPx, center.my - halfPx, halfPx * 2, halfPx * 2);
}

function jumpCameraFromMinimapEvent(clientX, clientY) {
    const rect = minimapCanvas.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width * MINIMAP_PX;
    const py = (clientY - rect.top) / rect.height * MINIMAP_PX;
    camPivot.x = (px / MINIMAP_PX) * MAP_WORLD_SIZE - MAP_WORLD_SIZE * 0.5;
    camPivot.z = (py / MINIMAP_PX) * MAP_WORLD_SIZE - MAP_WORLD_SIZE * 0.5;
    applyCameraTransform();
}

minimapCanvas.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    jumpCameraFromMinimapEvent(e.clientX, e.clientY);
});
minimapCanvas.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    if (e.touches.length === 1) jumpCameraFromMinimapEvent(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
