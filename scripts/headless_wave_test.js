// =============================================================================
// scripts/headless_wave_test.js — Headless-симуляция волн выживания на 1000x
// Использует общие константы и функции волн/сложности из js/config.js, js/maps.js, js/ai.js.
// Запуск: node scripts/headless_wave_test.js
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadSimulationContext(difficulty = 'normal', mapSize = '256') {
    const ctx = vm.createContext({
        console,
        THREE: {
            Vector3: class {
                constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
                set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
            }
        },
        window: { addEventListener() {} },
        document: { getElementById: () => null, addEventListener() {} },
        setTimeout: () => 0
    });
    ctx.globalThis = ctx;

    for (const rel of ['js/config.js', 'js/maps.js', 'js/ai.js']) {
        const filename = path.join(ROOT, rel);
        vm.runInContext(fs.readFileSync(filename, 'utf8'), ctx, { filename });
    }

    vm.runInContext(
        `currentDifficulty = ${JSON.stringify(difficulty)}; currentMapSize = ${JSON.stringify(String(mapSize))};`,
        ctx
    );

    return vm.runInContext(`({
        DRONE_TYPES,
        ENEMY_TYPES,
        DIFFICULTY_CONFIGS,
        MAP_SIZE_CONFIGS,
        MAX_WAVE_SIZE,
        buildWaveRoster,
        getMaxActiveEnemies,
        getWaveInterval
    })`, ctx);
}

function generateWaveRoster(waveNumber, mapSize = '256') {
    const sim = loadSimulationContext('normal', mapSize);
    const roster = sim.buildWaveRoster(waveNumber, sim.MAX_WAVE_SIZE);
    const maxActive = sim.getMaxActiveEnemies();
    return roster.slice(0, maxActive);
}

function applyDamageToAllyHeadless(target, amount) {
    if (target.shield && target.shield > 0) {
        if (target.shield >= amount) {
            target.shield -= amount;
        } else {
            const remainder = amount - target.shield;
            target.shield = 0;
            target.hp -= remainder;
        }
    } else {
        target.hp -= amount;
    }
}

function applyDamageToEnemyHeadless(target, amount) {
    if (target.shield && target.shield > 0) {
        target.shield -= amount;
        if (target.shield < 0) target.shield = 0;
    } else {
        target.hp -= amount;
    }
}

function simulateWaveBattle(waveNumber, strategyOrOptions = 'balanced') {
    const opts = typeof strategyOrOptions === 'string'
        ? { strategy: strategyOrOptions }
        : (strategyOrOptions || {});
    const strategy = opts.strategy || 'balanced';
    const difficulty = opts.difficulty || 'normal';
    const mapSize = String(opts.mapSize || '256');
    const capturedNodes = typeof opts.capturedNodes === 'number' ? opts.capturedNodes : 1;

    const sim = loadSimulationContext(difficulty, mapSize);
    const { DRONE_TYPES, ENEMY_TYPES, DIFFICULTY_CONFIGS } = sim;
    const diff = DIFFICULTY_CONFIGS[difficulty] || DIFFICULTY_CONFIGS.normal;
    const waveInterval = sim.getWaveInterval();
    const maxActiveEnemies = sim.getMaxActiveEnemies();

    let energy = 100;
    const allies = [];
    const enemies = [];

    const createAllyUnit = (type, spawnTime = 0) => {
        const stats = DRONE_TYPES[type] || DRONE_TYPES.standard;
        const hp = Math.round(stats.hp * diff.allyHpMult);
        return {
            ...stats,
            type,
            hp,
            maxHp: hp,
            shield: 0,
            shieldTimer: 0,
            abilityActive: false,
            abilityTimer: 0,
            lastAbilityTime: -99,
            isSieged: type === 'tank',
            lastAttack: spawnTime
        };
    };

    // Начальный гарнизон игрока (5 стандартных дронов, как в initStartingUnits)
    for (let i = 0; i < 5; i++) {
        allies.push(createAllyUnit('standard', 0));
    }

    // Доход игрока за интервал волны (зависит от сложности) + удержанные точки сбора
    const prepIncome = waveInterval * (diff.passiveIncome + capturedNodes * 3);
    energy += prepIncome;

    if (strategy === 'balanced') {
        while (energy >= DRONE_TYPES.tank.cost) {
            allies.push(createAllyUnit('tank', 0));
            energy -= DRONE_TYPES.tank.cost;
        }
        while (energy >= DRONE_TYPES.standard.cost) {
            allies.push(createAllyUnit('standard', 0));
            energy -= DRONE_TYPES.standard.cost;
        }
    } else if (strategy === 'scouts') {
        while (energy >= DRONE_TYPES.scout.cost) {
            allies.push(createAllyUnit('scout', 0));
            energy -= DRONE_TYPES.scout.cost;
        }
    }

    // Спавн вражеской волны из общего генератора js/ai.js с учётом лимита карты
    const fullRoster = sim.buildWaveRoster(waveNumber, sim.MAX_WAVE_SIZE);
    const roster = fullRoster.slice(0, maxActiveEnemies);
    for (const eType of roster) {
        const stats = ENEMY_TYPES[eType] || ENEMY_TYPES.standard;
        const hp = Math.round(stats.hp * diff.enemyHpMult);
        const damage = Math.round(stats.damage * diff.enemyDamageMult);
        const shield = stats.shield ? Math.round(stats.shield * diff.enemyHpMult) : 0;
        enemies.push({
            ...stats,
            type: eType,
            hp,
            maxHp: hp,
            damage,
            shield,
            maxShield: shield,
            lastAttack: 0
        });
    }

    // Headless-симуляция с фиксированным шагом 0.05с (1000x скорость)
    const dt = 0.05;
    let simTime = 0;
    const maxTime = 120.0;
    const abilitiesUsed = { shield: 0, overdrive: 0, siegeShots: 0, bossVolleys: 0 };

    while (simTime < maxTime) {
        simTime += dt;

        // Обновление таймеров и активация способностей юнитов
        for (const a of allies) {
            if (a.hp <= 0) continue;
            if (a.type === 'standard') {
                if (a.shield > 0) {
                    a.shieldTimer -= dt;
                    if (a.shieldTimer <= 0) a.shield = 0;
                }
                if (simTime - a.lastAbilityTime >= 12.0 && a.shield <= 0) {
                    a.lastAbilityTime = simTime;
                    a.shield = 50;
                    a.shieldTimer = 6.0;
                    abilitiesUsed.shield++;
                }
            } else if (a.type === 'scout') {
                if (a.abilityActive) {
                    a.abilityTimer -= dt;
                    if (a.abilityTimer <= 0) a.abilityActive = false;
                }
                if (simTime - a.lastAbilityTime >= 10.0 && !a.abilityActive) {
                    a.lastAbilityTime = simTime;
                    a.abilityActive = true;
                    a.abilityTimer = 3.0;
                    abilitiesUsed.overdrive++;
                }
            }
        }

        // Огонь союзников (Focus Fire + осадный сплэш танков + ускоренный темп разведчика в форсаже)
        for (const a of allies) {
            if (a.hp <= 0) continue;
            const effectiveCd = (a.type === 'scout' && a.abilityActive)
                ? a.attackCooldown * 0.75
                : a.attackCooldown;
            if (simTime - a.lastAttack >= effectiveCd) {
                let target = null;
                let minHp = Infinity;
                for (const e of enemies) {
                    if (e.hp > 0 && e.hp < minHp) {
                        minHp = e.hp;
                        target = e;
                    }
                }
                if (target) {
                    a.lastAttack = simTime;
                    applyDamageToEnemyHeadless(target, a.damage);

                    // Сплэш осадного танка (радиус 2.2: до 2 ближайших живых врагов получают 50% урона)
                    if (a.isSieged) {
                        abilitiesUsed.siegeShots++;
                        let splashHits = 0;
                        const splashDmg = Math.floor(a.damage * 0.5);
                        for (const other of enemies) {
                            if (other !== target && other.hp > 0) {
                                applyDamageToEnemyHeadless(other, splashDmg);
                                splashHits++;
                                if (splashHits >= 2) break;
                            }
                        }
                    }

                    for (const e of enemies) {
                        if (e.hp <= 0 && !e.rewardGiven) {
                            e.rewardGiven = true;
                            energy += (e.reward || 10);
                            if (energy >= DRONE_TYPES.standard.cost) {
                                allies.push(createAllyUnit('standard', simTime));
                                energy -= DRONE_TYPES.standard.cost;
                            }
                        }
                    }
                }
            }
        }

        // Огонь врагов по союзникам (учёт залпа Босса по 3 целям)
        for (const e of enemies) {
            if (e.hp <= 0) continue;
            if (simTime - e.lastAttack >= e.attackCooldown) {
                if (e.type === 'boss') {
                    const targets = [];
                    for (const a of allies) {
                        if (a.hp > 0) {
                            targets.push(a);
                            if (targets.length >= 3) break;
                        }
                    }
                    if (targets.length > 0) {
                        e.lastAttack = simTime;
                        abilitiesUsed.bossVolleys++;
                        if (targets.length <= 1) {
                            applyDamageToAllyHeadless(targets[0], e.damage);
                        } else {
                            const splitDmg = Math.floor(e.damage * 0.75);
                            for (const tgt of targets) {
                                applyDamageToAllyHeadless(tgt, splitDmg);
                            }
                        }
                    }
                } else {
                    let target = null;
                    for (const a of allies) {
                        if (a.hp > 0) { target = a; break; }
                    }
                    if (target) {
                        e.lastAttack = simTime;
                        applyDamageToAllyHeadless(target, e.damage);
                    }
                }
            }
        }

        const livingAllies = allies.filter(a => a.hp > 0).length;
        const livingEnemies = enemies.filter(e => e.hp > 0).length;

        if (livingEnemies === 0) {
            return {
                wave: waveNumber,
                difficulty,
                mapSize,
                result: 'VICTORY',
                time: simTime,
                alliesSurvived: livingAllies,
                enemiesRosterSize: roster.length,
                maxActiveEnemies,
                abilitiesUsed
            };
        }
        if (livingAllies === 0) {
            return {
                wave: waveNumber,
                difficulty,
                mapSize,
                result: 'DEFEAT',
                time: simTime,
                enemiesRemaining: livingEnemies,
                enemiesRosterSize: roster.length,
                maxActiveEnemies,
                abilitiesUsed
            };
        }
    }

    return {
        wave: waveNumber,
        difficulty,
        mapSize,
        result: 'TIMEOUT',
        time: maxTime,
        enemiesRosterSize: roster.length,
        maxActiveEnemies,
        abilitiesUsed
    };
}

function runSimulationSuite(options = {}) {
    const maxWaves = options.waves || 15;
    const results = [];
    let passedWaves = 0;
    for (let w = 1; w <= maxWaves; w++) {
        const res = simulateWaveBattle(w, options);
        results.push(res);
        if (res.result === 'VICTORY') passedWaves++;
    }
    return { passedWaves, totalWaves: maxWaves, results };
}

if (require.main === module) {
    const difficulty = process.argv[2] || 'normal';
    const mapSize = process.argv[3] || '256';
    console.log('===============================================================');
    console.log(`🛰️ HEADLESS SIMULATION: 15 волн (diff=${difficulty}, map=${mapSize})`);
    console.log('===============================================================');

    const { passedWaves, totalWaves, results } = runSimulationSuite({
        strategy: 'balanced',
        difficulty,
        mapSize
    });
    for (const res of results) {
        const statusIcon = res.result === 'VICTORY' ? '✅' : '❌';
        console.log(
            `${statusIcon} Волна ${String(res.wave).padStart(2)}: ${res.result.padEnd(8)} | ` +
            `Врагов: ${String(res.enemiesRosterSize).padStart(2)} | ` +
            `Время боя: ${res.time.toFixed(1)}с | ` +
            `Выжило союзников: ${res.alliesSurvived !== undefined ? res.alliesSurvived : 0}`
        );
    }

    console.log('---------------------------------------------------------------');
    console.log(`Итог прогона: ${passedWaves}/${totalWaves} волн успешно сбалансированы.`);
    console.log('===============================================================');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadSimulationContext,
        generateWaveRoster,
        simulateWaveBattle,
        runSimulationSuite
    };
}
