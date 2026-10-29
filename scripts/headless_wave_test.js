// =============================================================================
// scripts/headless_wave_test.js — Headless-симуляция волн выживания на 1000x
// Позволяет за секунды протестировать баланс 20+ волн без графического рендера:
// экономику, DPS, кулдауны, состав волн и шансы выживания.
// Запуск: node scripts/headless_wave_test.js
// =============================================================================

const DRONE_TYPES = {
    standard: { hp: 100, speed: 6.0, radius: 0.45, damage: 15, attackCooldown: 1.0, cost: 70 },
    scout:    { hp: 55,  speed: 12.0, radius: 0.225, damage: 6, attackCooldown: 1.0, cost: 40 },
    tank:     { hp: 220, speed: 3.0, radius: 0.63, damage: 45, attackCooldown: 1.6, cost: 150 }
};

const ENEMY_TYPES = {
    standard: { hp: 85,  speed: 4.5, radius: 0.45, damage: 12, attackCooldown: 1.1, reward: 10 },
    scout:    { hp: 50,  speed: 8.5, radius: 0.28, damage: 6, attackCooldown: 0.75, reward: 8 },
    tank:     { hp: 240, speed: 2.6, radius: 0.65, damage: 35, attackCooldown: 1.8, reward: 25 },
    boss:     { hp: 600, shield: 400, speed: 1.8, radius: 1.4, damage: 38, attackCooldown: 1.4, reward: 100 }
};

function generateWaveRoster(waveNumber) {
    const waveRoster = [];

    if (waveNumber === 10 || (waveNumber > 10 && waveNumber % 10 === 0)) {
        waveRoster.push('boss');
        waveRoster.push('tank', 'tank');
        for (let i = 0; i < 4; i++) waveRoster.push('scout');
        for (let i = 0; i < 3; i++) waveRoster.push('standard');
    } else {
        if (waveNumber % 3 === 0) {
            const swarmCount = Math.min(8, 3 + Math.floor(waveNumber * 0.7));
            for (let i = 0; i < swarmCount; i++) waveRoster.push('scout');
            waveRoster.push('tank');
        } else if (waveNumber % 4 === 0) {
            const armorTanks = Math.min(4, 2 + Math.floor(waveNumber / 3));
            for (let i = 0; i < armorTanks; i++) waveRoster.push('tank');
            for (let i = 0; i < 4; i++) waveRoster.push('standard');
        } else {
            const standardCount = Math.min(8, 3 + Math.floor(waveNumber * 0.5));
            for (let i = 0; i < standardCount; i++) waveRoster.push('standard');

            if (waveNumber >= 3) {
                const scoutCount = Math.min(6, 1 + Math.floor((waveNumber - 2) * 0.8));
                for (let i = 0; i < scoutCount; i++) waveRoster.push('scout');
            }

            if (waveNumber >= 5) {
                const tankCount = Math.min(4, 1 + Math.floor((waveNumber - 4) * 0.5));
                for (let i = 0; i < tankCount; i++) waveRoster.push('tank');
            }
        }
    }

    if (waveRoster.length > 25) {
        waveRoster.length = 25;
    }
    return waveRoster;
}

function simulateWaveBattle(waveNumber, strategy = 'balanced') {
    let energy = 100;
    const allies = [];
    const enemies = [];

    // Начальный гарнизон игрока
    for (let i = 0; i < 4; i++) {
        allies.push({ ...DRONE_TYPES.standard, hp: DRONE_TYPES.standard.hp, lastAttack: 0 });
    }

    // Доход игрока за время подготовки (60с) + 1 захваченная точка
    const prepIncome = 60 * (5 + 3);
    energy += prepIncome;

    // Производство по выбранной стратегии
    if (strategy === 'balanced') {
        while (energy >= DRONE_TYPES.tank.cost) {
            allies.push({ ...DRONE_TYPES.tank, hp: DRONE_TYPES.tank.hp, lastAttack: 0 });
            energy -= DRONE_TYPES.tank.cost;
        }
        while (energy >= DRONE_TYPES.standard.cost) {
            allies.push({ ...DRONE_TYPES.standard, hp: DRONE_TYPES.standard.hp, lastAttack: 0 });
            energy -= DRONE_TYPES.standard.cost;
        }
    } else if (strategy === 'scouts') {
        while (energy >= DRONE_TYPES.scout.cost) {
            allies.push({ ...DRONE_TYPES.scout, hp: DRONE_TYPES.scout.hp, lastAttack: 0 });
            energy -= DRONE_TYPES.scout.cost;
        }
    }

    // Спавн вражеской волны
    const roster = generateWaveRoster(waveNumber);
    for (const eType of roster) {
        const stats = ENEMY_TYPES[eType];
        enemies.push({ ...stats, hp: stats.hp, shield: stats.shield || 0, lastAttack: 0 });
    }

    // Headless-симуляция с фиксированным шагом 0.05с (1000x скорость)
    const dt = 0.05;
    let simTime = 0;
    const maxTime = 120.0; // 2 минуты макс

    while (simTime < maxTime) {
        simTime += dt;

        // Огонь союзников по врагам (Focus Fire: раненые цели в приоритете)
        for (const a of allies) {
            if (a.hp <= 0) continue;
            if (simTime - a.lastAttack >= a.attackCooldown) {
                // Выбор цели с наименьшим текущим HP
                let target = null;
                let minHp = 999999;
                for (const e of enemies) {
                    if (e.hp > 0 && e.hp < minHp) {
                        minHp = e.hp;
                        target = e;
                    }
                }
                if (target) {
                    a.lastAttack = simTime;
                    if (target.shield && target.shield > 0) {
                        target.shield -= a.damage;
                        if (target.shield < 0) {
                            target.hp += target.shield;
                            target.shield = 0;
                        }
                    } else {
                        target.hp -= a.damage;
                    }
                    if (target.hp <= 0 && !target.rewardGiven) {
                        target.rewardGiven = true;
                        energy += (target.reward || 10);
                        // Экстренный заказ подкрепления при накоплении энергии
                        if (energy >= DRONE_TYPES.standard.cost) {
                            allies.push({ ...DRONE_TYPES.standard, hp: DRONE_TYPES.standard.hp, lastAttack: simTime });
                            energy -= DRONE_TYPES.standard.cost;
                        }
                    }
                }
            }
        }

        // Огонь врагов по союзникам
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (simTime - e.lastAttack >= e.attackCooldown) {
                let target = null;
                for (const a of allies) {
                    if (a.hp > 0) { target = a; break; }
                }
                if (target) {
                    e.lastAttack = simTime;
                    target.hp -= e.damage;
                }
            }
        }

        const livingAllies = allies.filter(a => a.hp > 0).length;
        const livingEnemies = enemies.filter(e => e.hp > 0).length;

        if (livingEnemies === 0) {
            return {
                wave: waveNumber,
                result: 'VICTORY',
                time: simTime,
                alliesSurvived: livingAllies,
                enemiesRosterSize: roster.length
            };
        }
        if (livingAllies === 0) {
            return {
                wave: waveNumber,
                result: 'DEFEAT',
                time: simTime,
                enemiesRemaining: livingEnemies,
                enemiesRosterSize: roster.length
            };
        }
    }

    return { wave: waveNumber, result: 'TIMEOUT', time: maxTime };
}

console.log('===============================================================');
console.log('🛰️ HEADLESS SIMULATION: Баланс 15 волн выживания на скорости 1000x');
console.log('===============================================================');

let passedWaves = 0;
for (let w = 1; w <= 15; w++) {
    const res = simulateWaveBattle(w, 'balanced');
    const statusIcon = res.result === 'VICTORY' ? '✅' : '❌';
    console.log(
        `${statusIcon} Волна ${String(w).padStart(2)}: ${res.result.padEnd(8)} | ` +
        `Врагов: ${String(res.enemiesRosterSize).padStart(2)} | ` +
        `Время боя: ${res.time.toFixed(1)}с | ` +
        `Выжило союзников: ${res.alliesSurvived !== undefined ? res.alliesSurvived : 0}`
    );
    if (res.result === 'VICTORY') passedWaves++;
}

console.log('---------------------------------------------------------------');
console.log(`Итог прогона: ${passedWaves}/15 волн успешно сбалансированы.`);
console.log('===============================================================');
