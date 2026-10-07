// =============================================================================
// js/economy.js — Экономика, энергия, производство юнитов и UI ресурсов
// =============================================================================

let energy = 100;
const ENERGY_INCOME_PER_SEC = 5;
const ENEMY_KILL_REWARD = 10;
let energyAccumulator = 0;

const energyValueEl = document.getElementById('energy-value');
const energyIncomeBadgeEl = document.getElementById('energy-income');
const nodesCountEl = document.getElementById('nodes-count');
const produceBtnEl = document.getElementById('produce-btn');
const scoutBtnEl = document.getElementById('scout-btn');
const tankBtnEl = document.getElementById('tank-btn');

function updateResourceUI() {
    if (energyValueEl) energyValueEl.textContent = Math.floor(energy);

    const playerControlledNodes = resourceNodes.filter(n => n.owner === 'player').length;
    const currentIncome = ENERGY_INCOME_PER_SEC + playerControlledNodes * NODE_ENERGY_BONUS;

    if (energyIncomeBadgeEl) energyIncomeBadgeEl.textContent = `(+${currentIncome}⚡/сек)`;
    if (nodesCountEl) {
        nodesCountEl.textContent = `${playerControlledNodes}/${resourceNodes.length}`;
        nodesCountEl.style.color = playerControlledNodes > 0 ? '#00ffcc' : '#ffaa00';
    }

    if (produceBtnEl) {
        produceBtnEl.disabled = energy < DRONE_TYPES.standard.cost;
        produceBtnEl.textContent = `${DRONE_TYPES.standard.label} (${DRONE_TYPES.standard.cost}⚡)`;
    }
    if (scoutBtnEl) {
        scoutBtnEl.disabled = energy < DRONE_TYPES.scout.cost;
        scoutBtnEl.textContent = `${DRONE_TYPES.scout.label} (${DRONE_TYPES.scout.cost}⚡)`;
    }
    if (tankBtnEl) {
        tankBtnEl.disabled = energy < DRONE_TYPES.tank.cost;
        tankBtnEl.textContent = `${DRONE_TYPES.tank.label} (${DRONE_TYPES.tank.cost}⚡)`;
    }
}

function produceUnit(type = 'standard') {
    const cost = DRONE_TYPES[type].cost;
    if (energy < cost) return;
    energy -= cost;
    const spot = findFreeCellNear(BASE_COL, BASE_ROW);
    createUnit(spot.col, spot.row, type);
    updateResourceUI();
}

function spawnEnemyNearCenter() {
    const centerGrid = worldToGrid(camPivot.x, camPivot.z);
    const spot = findFreeCellNear(centerGrid.col, centerGrid.row);
    const worldPos = gridToWorld(spot.col, spot.row);
    createEnemy(worldPos.x, worldPos.z, 'standard');
}
