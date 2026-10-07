// =============================================================================
// js/input.js — Управление: выбор юнитов, приказы, MMB панорама, сенсор/тач, WASD
// =============================================================================

const mouse = new THREE.Vector2();
const startPoint = new THREE.Vector2();
let isSelecting = false;
let isDragging = false;
const DRAG_THRESHOLD = 6;
const selectionBoxEl = document.getElementById('selection-box');
const raycaster = new THREE.Raycaster();
const UI_SELECTOR = '#instructions, #resource-panel, #minimap-wrap, #wave-panel, #tactical-alert, #main-menu-overlay, #game-over-overlay, #touch-mode-panel';

// --- Состояние перемещения колёсиком мыши (MMB Drag) ---
let isMiddlePanning = false;
let lastPanMouseX = 0;
let lastPanMouseY = 0;

// --- Состояние сенсорного управления (Touch & Mobile) ---
let currentTouchMode = 'pan'; // 'pan' (панорама карты) или 'select' (рамка выделения)
let isTouchPanning = false;
let hasTouchMoved = false;
let touchStartTime = 0;
let lastTouchX = 0;
let lastTouchY = 0;
const TAP_MAX_DURATION_MS = 320;

// Двухпальцевый жест (Pinch-Zoom и панорама)
let pinchStartDist = 0;
let pinchStartZoom = 0;
let twoFingerStartMid = { x: 0, y: 0 };
let twoFingerStartPivot = new THREE.Vector3();

// Переключатель режима сенсора
function toggleTouchMode() {
    currentTouchMode = (currentTouchMode === 'pan') ? 'select' : 'pan';
    const btn = document.getElementById('touch-mode-btn');
    if (btn) {
        if (currentTouchMode === 'pan') {
            btn.textContent = '🖐 Карта (Сенсор)';
            btn.style.borderColor = '#00ffcc';
            btn.style.color = '#00ffcc';
        } else {
            btn.textContent = '⬚ Рамка (Выбор)';
            btn.style.borderColor = '#ffaa00';
            btn.style.color = '#ffaa00';
        }
    }
}

function updateMouseNDC(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

function getUnitUnderScreenPoint(clientX, clientY) {
    updateMouseNDC(clientX, clientY);
    raycaster.setFromCamera(mouse, camera);

    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.hp <= 0) continue;
        const hits = raycaster.intersectObject(u.mesh, true);
        if (hits.length > 0) return u;
    }
    return null;
}

function updateDragSelection(currentX, currentY, additive) {
    const minX = Math.min(startPoint.x, currentX); const maxX = Math.max(startPoint.x, currentX);
    const minY = Math.min(startPoint.y, currentY); const maxY = Math.max(startPoint.y, currentY);

    selectionBoxEl.style.left = minX + 'px'; selectionBoxEl.style.top = minY + 'px';
    selectionBoxEl.style.width = (maxX - minX) + 'px'; selectionBoxEl.style.height = (maxY - minY) + 'px';

    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (unit.hp <= 0) continue;
        _projVec.copy(unit.mesh.position).project(camera);
        const x = (_projVec.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-_projVec.y * 0.5 + 0.5) * window.innerHeight;

        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            unit.selected = true;
            if (unit.mesh.userData.selectionRing) unit.mesh.userData.selectionRing.visible = true;
        } else if (!additive) {
            unit.selected = false;
            if (unit.mesh.userData.selectionRing) unit.mesh.userData.selectionRing.visible = false;
        }
    }
    if (typeof updateAbilityUI === 'function') updateAbilityUI();
}

function getEnemyUnderScreenPoint(clientX, clientY) {
    updateMouseNDC(clientX, clientY);
    raycaster.setFromCamera(mouse, camera);

    if (typeof enemyHQ !== 'undefined' && enemyHQ.hp > 0) {
        const hits = raycaster.intersectObject(enemyHQ.mesh, true);
        if (hits.length > 0) return enemyHQ;
    }

    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.hp <= 0) continue;
        const hits = raycaster.intersectObject(e.mesh, true);
        if (hits.length > 0) return e;
    }
    return null;
}

function issueMoveOrderAtPoint(clientX, clientY) {
    const selectedUnits = [];
    let sumX = 0, sumZ = 0;
    for (let i = 0; i < units.length; i++) {
        if (units[i].selected && units[i].hp > 0) {
            selectedUnits.push(units[i]);
            sumX += units[i].mesh.position.x;
            sumZ += units[i].mesh.position.z;
        }
    }
    if (selectedUnits.length === 0) return;

    // 1. Проверка клика по врагу или штабу врага (Фокус-атака)
    const targetEnemy = getEnemyUnderScreenPoint(clientX, clientY);
    if (targetEnemy) {
        const enemyPos = targetEnemy.mesh.position;
        if (typeof spawnOrderMarker === 'function') {
            spawnOrderMarker(enemyPos.x, enemyPos.z, true);
        }
        for (let i = 0; i < selectedUnits.length; i++) {
            const u = selectedUnits[i];
            u.targetEnemy = targetEnemy;
            u.state = States.CHASE;
            u.personalTarget = null;
        }
        return;
    }

    // 2. Клик по земле — приказ перемещения по Flow Field
    updateMouseNDC(clientX, clientY);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(ground);
    if (intersects.length === 0) return;

    let targetPoint = intersects[0].point;
    let targetGrid = worldToGrid(targetPoint.x, targetPoint.z);

    targetGrid.col = THREE.MathUtils.clamp(targetGrid.col, 1, GRID_SIZE - 2);
    targetGrid.row = THREE.MathUtils.clamp(targetGrid.row, 1, GRID_SIZE - 2);

    // Если кликнули в стену — направляем в ближайшую свободную клетку рядом
    if (grid[targetGrid.row][targetGrid.col] === 1) {
        const freeCell = findFreeCellNear(targetGrid.col, targetGrid.row);
        targetGrid.col = freeCell.col;
        targetGrid.row = freeCell.row;
        const freeWorld = gridToWorld(freeCell.col, freeCell.row);
        targetPoint = { x: freeWorld.x, y: 0, z: freeWorld.z };
    }

    if (typeof spawnOrderMarker === 'function') {
        spawnOrderMarker(targetPoint.x, targetPoint.z, false);
    }

    const count = selectedUnits.length;
    const groupCenterX = sumX / count;
    const groupCenterZ = sumZ / count;

    const angle = Math.atan2(targetPoint.z - groupCenterZ, targetPoint.x - groupCenterX);
    const offsets = getFormationOffsets(count, currentFormation);
    flowFieldGen.updateTarget(targetGrid.col, targetGrid.row);

    const cosA = Math.cos(-angle);
    const sinA = Math.sin(-angle);

    for (let i = 0; i < count; i++) {
        const unit = selectedUnits[i];
        const offset = offsets[i];
        const rotatedX = offset.x * cosA - offset.y * sinA;
        const rotatedZ = offset.x * sinA + offset.y * cosA;

        if (!unit.personalTarget) {
            unit.personalTarget = new THREE.Vector3();
        }
        unit.personalTarget.set(targetPoint.x + rotatedX, 0.75, targetPoint.z + rotatedZ);
        unit.state = States.MOVE;
        unit.targetEnemy = null;
    }
}

function clampCameraBounds() {
    const maxBound = MAP_WORLD_SIZE * 0.55;
    camPivot.x = THREE.MathUtils.clamp(camPivot.x, -maxBound, maxBound);
    camPivot.z = THREE.MathUtils.clamp(camPivot.z, -maxBound, maxBound);
    applyCameraTransform();
}

// --- 1. ОБРАБОТКА МЫШИ (ДЕСКТОП + КОЛЁСИКО) ---
window.addEventListener('mousedown', (e) => {
    if (e.target.closest(UI_SELECTOR) || e.target.closest('button, a')) return;

    // Зажатие колёсика мыши (MMB / button === 1) — режим перемещения карты
    if (e.button === 1) {
        e.preventDefault();
        isMiddlePanning = true;
        lastPanMouseX = e.clientX;
        lastPanMouseY = e.clientY;
        document.body.style.cursor = 'grabbing';
        return;
    }

    // ЛКМ (button === 0) — рамка выделения
    if (e.button === 0) {
        isSelecting = true;
        isDragging = false;
        startPoint.set(e.clientX, e.clientY);
    }
});

window.addEventListener('mousemove', (e) => {
    updateMouseNDC(e.clientX, e.clientY);

    // Панорама карты зажатым колёсиком мыши (MMB)
    if (isMiddlePanning) {
        const dx = e.clientX - lastPanMouseX;
        const dy = e.clientY - lastPanMouseY;
        lastPanMouseX = e.clientX;
        lastPanMouseY = e.clientY;

        const panScale = (camZoomDist / BASE_CAM_DIST) * (38.0 / Math.max(window.innerHeight, 400));
        camPivot.x -= dx * panScale;
        camPivot.z -= dy * panScale;
        clampCameraBounds();
        return;
    }

    // Рамка выделения
    if (!isSelecting) return;
    const dragDistance = Math.hypot(e.clientX - startPoint.x, e.clientY - startPoint.y);
    if (!isDragging && dragDistance > DRAG_THRESHOLD) {
        isDragging = true;
        selectionBoxEl.style.display = 'block';
    }
    if (isDragging) updateDragSelection(e.clientX, e.clientY, e.shiftKey);
});

window.addEventListener('mouseup', (e) => {
    // Отпускание колёсика мыши (MMB)
    if (e.button === 1 && isMiddlePanning) {
        isMiddlePanning = false;
        document.body.style.cursor = '';
        return;
    }

    // Отпускание ЛКМ
    if (e.button === 0) {
        isSelecting = false;
        selectionBoxEl.style.display = 'none';
        if (!isDragging && !e.target.closest(UI_SELECTOR)) {
            const clickedUnit = getUnitUnderScreenPoint(e.clientX, e.clientY);
            if (!e.shiftKey) {
                for (let i = 0; i < units.length; i++) {
                    units[i].selected = false;
                    if (units[i].mesh.userData.selectionRing) units[i].mesh.userData.selectionRing.visible = false;
                }
            }
            if (clickedUnit) {
                clickedUnit.selected = true;
                if (clickedUnit.mesh.userData.selectionRing) clickedUnit.mesh.userData.selectionRing.visible = true;
            }
            if (typeof updateAbilityUI === 'function') updateAbilityUI();
        }
        isDragging = false;
    }
});

// ПКМ — приказ перемещения / атаки
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.closest(UI_SELECTOR) || e.target.closest('button, a')) return;
    issueMoveOrderAtPoint(e.clientX, e.clientY);
});

// Вращение колёсика мыши (Зум и Touchpad горизонтальный скролл)
window.addEventListener('wheel', (e) => {
    if (e.target.closest(UI_SELECTOR)) return;
    e.preventDefault();

    // Горизонтальный скролл (например, тачпад или наклон колеса)
    if (Math.abs(e.deltaX) > 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5) {
        const panScale = (camZoomDist / BASE_CAM_DIST) * 0.04;
        camPivot.x += e.deltaX * panScale;
        clampCameraBounds();
        return;
    }

    // Вертикальный зум колёсиком
    camZoomDist += e.deltaY * 0.04;
    camZoomDist = THREE.MathUtils.clamp(camZoomDist, MIN_ZOOM_DIST, MAX_ZOOM_DIST);
    applyCameraTransform();
}, { passive: false });

// --- 2. СЕНСОРНОЕ УПРАВЛЕНИЕ (TOUCH & SENSOR) ---
function handleTap(clientX, clientY) {
    const tappedUnit = getUnitUnderScreenPoint(clientX, clientY);
    if (tappedUnit) {
        for (let i = 0; i < units.length; i++) {
            units[i].selected = false;
            if (units[i].mesh.userData.selectionRing) units[i].mesh.userData.selectionRing.visible = false;
        }
        tappedUnit.selected = true;
        if (tappedUnit.mesh.userData.selectionRing) tappedUnit.mesh.userData.selectionRing.visible = true;
        if (typeof updateAbilityUI === 'function') updateAbilityUI();
        return;
    }

    if (units.some(u => u.selected)) {
        issueMoveOrderAtPoint(clientX, clientY);
    }
}

window.addEventListener('touchstart', (e) => {
    if (e.target.closest(UI_SELECTOR) || e.target.closest('button, a')) return;
    e.preventDefault();

    if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStartTime = performance.now();
        hasTouchMoved = false;
        lastTouchX = t.clientX;
        lastTouchY = t.clientY;
        startPoint.set(t.clientX, t.clientY);
        updateMouseNDC(t.clientX, t.clientY);

        if (currentTouchMode === 'pan') {
            isTouchPanning = true;
            isSelecting = false;
        } else {
            isTouchPanning = false;
            isSelecting = true;
            isDragging = false;
        }
    } else if (e.touches.length === 2) {
        // Двухпальцевый жест (панорама + pinch zoom)
        isTouchPanning = false;
        isSelecting = false;
        isDragging = false;
        selectionBoxEl.style.display = 'none';

        const [t0, t1] = e.touches;
        pinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        pinchStartZoom = camZoomDist;
        twoFingerStartMid = { x: (t0.clientX + t1.clientX) * 0.5, y: (t0.clientY + t1.clientY) * 0.5 };
        twoFingerStartPivot.copy(camPivot);
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (e.target.closest(UI_SELECTOR)) return;
    e.preventDefault();

    if (e.touches.length === 1) {
        const t = e.touches[0];
        const distMoved = Math.hypot(t.clientX - startPoint.x, t.clientY - startPoint.y);
        if (distMoved > DRAG_THRESHOLD) hasTouchMoved = true;

        if (isTouchPanning) {
            // Перемещение карты сенсором (1 палец)
            const dx = t.clientX - lastTouchX;
            const dy = t.clientY - lastTouchY;
            lastTouchX = t.clientX;
            lastTouchY = t.clientY;

            const panScale = (camZoomDist / BASE_CAM_DIST) * (38.0 / Math.max(window.innerHeight, 400));
            camPivot.x -= dx * panScale;
            camPivot.z -= dy * panScale;
            clampCameraBounds();
        } else if (isSelecting) {
            // Рамка выделения на таче
            updateMouseNDC(t.clientX, t.clientY);
            if (!isDragging && distMoved > DRAG_THRESHOLD) {
                isDragging = true;
                selectionBoxEl.style.display = 'block';
            }
            if (isDragging) updateDragSelection(t.clientX, t.clientY, false);
        }
    } else if (e.touches.length === 2) {
        // Двухпальцевый Pinch-Zoom и панорама
        const [t0, t1] = e.touches;
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const zoomFactor = pinchStartDist / Math.max(dist, 1);
        camZoomDist = THREE.MathUtils.clamp(pinchStartZoom * zoomFactor, MIN_ZOOM_DIST, MAX_ZOOM_DIST);

        const midX = (t0.clientX + t1.clientX) * 0.5;
        const midY = (t0.clientY + t1.clientY) * 0.5;
        const dx = midX - twoFingerStartMid.x;
        const dy = midY - twoFingerStartMid.y;
        const panScale = (camZoomDist / BASE_CAM_DIST) * 0.06;
        camPivot.x = twoFingerStartPivot.x - dx * panScale;
        camPivot.z = twoFingerStartPivot.z - dy * panScale;
        clampCameraBounds();
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        if (!hasTouchMoved && (performance.now() - touchStartTime) < TAP_MAX_DURATION_MS) {
            if (e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                handleTap(t.clientX, t.clientY);
            }
        }
        isTouchPanning = false;
        isSelecting = false;
        isDragging = false;
        selectionBoxEl.style.display = 'none';
    } else if (e.touches.length === 1) {
        // Если остался один палец, сбрасываем точку начала
        const t = e.touches[0];
        lastTouchX = t.clientX;
        lastTouchY = t.clientY;
        if (currentTouchMode === 'pan') isTouchPanning = true;
    }
}, { passive: false });

window.addEventListener('touchcancel', () => {
    isTouchPanning = false;
    isSelecting = false;
    isDragging = false;
    selectionBoxEl.style.display = 'none';
}, { passive: true });

// --- 3. КЛАВИАТУРА И ДВИЖЕНИЕ КАМЕРЫ (WASD / СТРЕЛКИ) ---
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;

    // Горячие клавиши способностей: Q (Форсаж), E (Щит), R/F (Осада), 1/2/3
    if (e.code === 'KeyQ') {
        if (typeof triggerAbilityForSelected === 'function') triggerAbilityForSelected('overdrive');
    } else if (e.code === 'KeyE') {
        if (typeof triggerAbilityForSelected === 'function') triggerAbilityForSelected('shield');
    } else if (e.code === 'KeyR' || e.code === 'KeyF') {
        if (typeof triggerAbilityForSelected === 'function') triggerAbilityForSelected('siege');
    } else if (e.code === 'Digit1') {
        if (typeof triggerAbilityForSelected === 'function') triggerAbilityForSelected('shield');
    } else if (e.code === 'Digit2') {
        if (typeof triggerAbilityForSelected === 'function') triggerAbilityForSelected('overdrive');
    } else if (e.code === 'Digit3') {
        if (typeof triggerAbilityForSelected === 'function') triggerAbilityForSelected('siege');
    } else if (e.code === 'KeyG') {
        // Спавн тестового врага (дебаг)
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(ground);
        if (intersects.length > 0) {
            createEnemy(intersects[0].point.x, intersects[0].point.z, 'standard');
        }
    }
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

function updateCamera(delta) {
    const camSpeed = 25 * delta * (camZoomDist / BASE_CAM_DIST);
    if (keys['KeyW'] || keys['ArrowUp']) { camPivot.z -= camSpeed; }
    if (keys['KeyS'] || keys['ArrowDown']) { camPivot.z += camSpeed; }
    if (keys['KeyA'] || keys['ArrowLeft']) { camPivot.x -= camSpeed; }
    if (keys['KeyD'] || keys['ArrowRight']) { camPivot.x += camSpeed; }
    clampCameraBounds();
}
