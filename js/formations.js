// =============================================================================
// js/formations.js — Тактические построения отрядов (Шеренга, Клин)
// =============================================================================

let currentFormation = 'line';
const SPACING = 1.2;

function setFormation(type) {
    currentFormation = type;
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
