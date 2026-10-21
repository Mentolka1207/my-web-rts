// =============================================================================
// js/formations.js — Тактические построения отрядов (Шеренга, Клин)
// =============================================================================

let currentFormation = 'line';
const SPACING = 1.2;

function updateFormationUI() {
    const lineBtn = document.getElementById('formation-line-btn');
    const wedgeBtn = document.getElementById('formation-wedge-btn');
    const circleBtn = document.getElementById('formation-circle-btn');

    const updateBtn = (btn, active) => {
        if (!btn) return;
        btn.style.background = active ? '#00ffcc' : '#0077ff';
        btn.style.color = active ? '#000000' : '#ffffff';
        btn.style.borderColor = active ? '#00ffcc' : '#00a2ff';
        btn.style.boxShadow = active ? '0 0 10px rgba(0, 255, 204, 0.6)' : 'none';
    };

    updateBtn(lineBtn, currentFormation === 'line');
    updateBtn(wedgeBtn, currentFormation === 'wedge');
    updateBtn(circleBtn, currentFormation === 'circle');
}

function setFormation(type) {
    currentFormation = type;
    updateFormationUI();
    if (typeof playSelectSound === 'function') playSelectSound();
}

// Первичная инициализация подсветки кнопки построения
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateFormationUI);
    } else {
        setTimeout(updateFormationUI, 50);
    }
}

function getFormationOffsets(numUnits, type) {
    const offsets = [];
    if (type === 'line') {
        for (let i = 0; i < numUnits; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const step = Math.ceil(i / 2);
            offsets.push(new THREE.Vector2(side * step * SPACING, 0));
        }
    } else if (type === 'wedge') {
        offsets.push(new THREE.Vector2(0, 0));
        for (let i = 1; i < numUnits; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const step = Math.ceil(i / 2);
            offsets.push(new THREE.Vector2(side * step * SPACING, -step * SPACING));
        }
    } else if (type === 'circle') {
        // Круговое защитное построение вокруг осадных танков или командира
        const radius = Math.max(1.8, (numUnits * SPACING) / (2 * Math.PI));
        for (let i = 0; i < numUnits; i++) {
            const angle = (i / numUnits) * Math.PI * 2;
            offsets.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
        }
    }
    return offsets;
}
