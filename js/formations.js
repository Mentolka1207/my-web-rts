// =============================================================================
// js/formations.js — Тактические построения отрядов (Шеренга, Клин)
// =============================================================================

let currentFormation = 'line';
const SPACING = 1.2;

function updateFormationUI() {
    const lineBtn = document.getElementById('formation-line-btn');
    const wedgeBtn = document.getElementById('formation-wedge-btn');
    if (lineBtn) {
        const isLine = currentFormation === 'line';
        lineBtn.style.background = isLine ? '#00ffcc' : '#0077ff';
        lineBtn.style.color = isLine ? '#000000' : '#ffffff';
        lineBtn.style.borderColor = isLine ? '#00ffcc' : '#00a2ff';
        lineBtn.style.boxShadow = isLine ? '0 0 10px rgba(0, 255, 204, 0.6)' : 'none';
    }
    if (wedgeBtn) {
        const isWedge = currentFormation === 'wedge';
        wedgeBtn.style.background = isWedge ? '#00ffcc' : '#0077ff';
        wedgeBtn.style.color = isWedge ? '#000000' : '#ffffff';
        wedgeBtn.style.borderColor = isWedge ? '#00ffcc' : '#00a2ff';
        wedgeBtn.style.boxShadow = isWedge ? '0 0 10px rgba(0, 255, 204, 0.6)' : 'none';
    }
}

function setFormation(type) {
    currentFormation = type;
    updateFormationUI();
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
    }
    return offsets;
}
