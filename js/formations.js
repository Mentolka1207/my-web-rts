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
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1; // radiogroup: в группу попадаем Tab, по пунктам ходим стрелками
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

// Радиогруппа построений: стрелки переключают пункт и не двигают камеру
function onFormationGroupKeydown(e) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    const order = ['line', 'wedge', 'circle'];
    const idx = (order.indexOf(currentFormation) + keys[e.key] + order.length) % order.length;
    e.preventDefault();
    e.stopPropagation();
    setFormation(order[idx]);
    const btn = document.getElementById(`formation-${order[idx]}-btn`);
    if (btn) btn.focus();
}

// Первичная инициализация подсветки кнопки построения
if (typeof document !== 'undefined') {
    const bindGroup = () => {
        if (typeof document.querySelector !== 'function') return; // тестовая заглушка DOM
        const group = document.querySelector('.formation-row[role="radiogroup"]');
        if (group) group.addEventListener('keydown', onFormationGroupKeydown);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindGroup);
    else bindGroup();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateFormationUI);
    } else {
        setTimeout(updateFormationUI, 50);
    }
}

// Поворот смещения строя из локальных осей в мировые. Локально x — вдоль фронта (вправо от
// направления движения), y — вперёд по ходу (отрицательный y — позади ведущего). angle — направление
// движения отряда, Math.atan2(dz, dx). Раньше поворот шёл на −angle: строй вставал правильно только
// при движении по диагонали карты, а при движении вдоль осей шеренга вытягивалась в колонну,
// клин разворачивался боком.
function orientFormationOffset(offset, angle, out) {
    const fx = Math.cos(angle);
    const fz = Math.sin(angle);
    out.x = offset.x * fz + offset.y * fx;
    out.z = -offset.x * fx + offset.y * fz;
    return out;
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
