// scripts/playtest_waves.js — автоматический плейтест волн в настоящей игре (T-09).
//
// В отличие от scripts/headless_wave_test.js здесь работает вся игра в Chromium: index.html, js/fsm.js,
// flow field, спавн волн из js/ai.js, экономика. Реальный цикл заморожен (isGamePaused), симуляция
// шагается вручную по 1/30 с — как fastForward в e2e/fixtures.js, поэтому прогон детерминирован по сиду.
//
// Игрок — скрипт «оборона у штаба» (без микроконтроля и без захвата точек):
//   каждые 3 с игрового времени тратит энергию по кругу [дрон, дрон, разведчик, танк], пока армия < 40;
//   приказов не даёт — юниты стоят у базы и сами вступают в бой (IDLE → CHASE → ATTACK).
// Это прокси «давления», а не замена живому игроку: человек захватывает точки и маневрирует.
//
// Запуск: node scripts/playtest_waves.js [--sizes 256,1024] [--maps canyon,arena,maze,crossroads]
//                                        [--waves 12] [--seed 11] [--difficulty normal] [--out docs/playtest-T09.json]
// Нужен Chromium Playwright (npx playwright install chromium).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

function arg(name, def) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : def;
}

const SIZES = arg('sizes', '256,1024').split(',');
const MAPS = arg('maps', 'canyon,arena,maze,crossroads').split(',');
const WAVES = Number(arg('waves', '12'));
const SEED = arg('seed', '11');
const DIFFICULTY = arg('difficulty', 'normal');
const OUT = arg('out', '');
const PORT = Number(process.env.PLAYTEST_PORT || 4190);
const ROOT = path.resolve(__dirname, '..');

// Код, который выполняется в странице: один прогон матча до WAVES волн или до конца игры.
// Возвращает метрики по каждой волне.
async function runInPage(page, waves) {
    return page.evaluate(async (WAVES) => {
        const DT = 1 / 30;
        const SAMPLE_EVERY = 6;           // замер раз в 0.2 с игрового времени
        const BUILD_EVERY = 90;           // решение о постройке раз в 3 с
        const BUILD_CYCLE = ['standard', 'standard', 'scout', 'tank'];
        const ARMY_CAP = 40;
        const reachR = 8 * CELL_SIZE;     // «дошёл до базы»: 8 клеток от центра штаба игрока

        isGamePaused = true;              // реальный цикл не шагает симуляцию — шагаем только мы
        const hq = playerHQ.mesh.position;
        const ehq = enemyHQ.mesh.position;
        const routeLen = Math.hypot(hq.x - ehq.x, hq.z - ehq.z);

        const seenEnemies = new Set();
        const seenUnits = new Set(units);
        const W = {};                     // метрики по волнам
        let buildIdx = 0, tick = 0, prevWave = waveNumber;
        let lostTotal = 0;
        const t0 = simElapsedTime;

        const wave = (n) => (W[n] ||= {
            wave: n, spawnAt: null, spawned: 0, roster: {}, firstReachSec: null, lastReachSec: null, reached: 0,
            killedBeforeBase: 0, hqHpStart: null, hqHpEnd: null, alliesLost: 0, peakEnemiesAlive: 0,
            backlogAtNextWave: null
        });

        function sample() {
            // новые враги: метка волны, в которой появились
            for (const e of enemies) {
                if (seenEnemies.has(e)) continue;
                seenEnemies.add(e);
                e.__pt = { wave: e.isWaveUnit ? waveNumber : 0, minDist: Infinity, reached: false, counted: false };
                if (e.isWaveUnit) {
                    const w = wave(waveNumber);
                    w.spawned++;
                    w.roster[e.type] = (w.roster[e.type] || 0) + 1;
                }
            }
            let alive = 0;
            for (const e of seenEnemies) {
                const m = e.__pt;
                if (!m || m.wave === 0) continue;
                const w = wave(m.wave);
                if (e.hp > 0 && enemies.includes(e)) {
                    alive++;
                    const d = Math.hypot(e.mesh.position.x - hq.x, e.mesh.position.z - hq.z);
                    if (d < m.minDist) m.minDist = d;
                    if (!m.reached && d <= reachR) {
                        m.reached = true;
                        w.reached++;
                        const sec = +(simElapsedTime - w.spawnAt).toFixed(1);
                        if (w.firstReachSec === null) w.firstReachSec = sec;
                        w.lastReachSec = sec;
                    }
                } else if (!m.counted) {
                    m.counted = true;
                    if (!m.reached) w.killedBeforeBase++;
                }
            }
            if (waveNumber > 0) {
                const w = wave(waveNumber);
                if (alive > w.peakEnemiesAlive) w.peakEnemiesAlive = alive;
            }
            // потери союзников
            for (const u of seenUnits) {
                if (u.hp <= 0 || !units.includes(u)) {
                    seenUnits.delete(u);
                    lostTotal++;
                    if (waveNumber > 0) wave(waveNumber).alliesLost++;
                }
            }
            for (const u of units) if (u.hp > 0) seenUnits.add(u);
        }

        function build() {
            let army = units.filter(u => u.hp > 0).length;
            while (army < ARMY_CAP) {
                const type = BUILD_CYCLE[buildIdx % BUILD_CYCLE.length];
                if (energy < DRONE_TYPES[type].cost) break;
                produceUnit(type);
                buildIdx++;
                army++;
            }
        }

        while (!gameOver && (waveNumber < WAVES || simElapsedTime - (W[WAVES]?.spawnAt ?? Infinity) < getWaveInterval())) {
            stepSimulation(DT, simElapsedTime);
            simElapsedTime += DT;
            tick++;
            if (waveNumber !== prevWave) {
                // новая волна: закрыть предыдущую
                if (W[prevWave]) {
                    W[prevWave].hqHpEnd = Math.round(playerHQ.hp);
                    W[prevWave].backlogAtNextWave = enemies.filter(e => e.hp > 0 && e.__pt && e.__pt.wave > 0).length;
                }
                const w = wave(waveNumber);
                w.spawnAt = simElapsedTime;
                w.hqHpStart = Math.round(playerHQ.hp);
                prevWave = waveNumber;
            }
            if (tick % SAMPLE_EVERY === 0) sample();
            if (tick % BUILD_EVERY === 0) build();
            if (tick % 900 === 0) await new Promise(r => setTimeout(r, 0)); // не вешать страницу
        }
        sample();
        if (W[waveNumber] && W[waveNumber].hqHpEnd === null) W[waveNumber].hqHpEnd = Math.round(Math.max(0, playerHQ.hp));

        return {
            cellSize: CELL_SIZE,
            routeLen: Math.round(routeLen),
            reachR,
            hqMaxHp: playerHQ.maxHp,
            result: gameOver ? (playerHQ.hp <= 0 ? 'DEFEAT' : 'VICTORY') : 'SURVIVED',
            wavesSeen: waveNumber,
            simSeconds: Math.round(simElapsedTime - t0),
            unitsProduced: matchStats.unitsProduced,
            enemiesKilled: matchStats.enemiesKilled,
            alliesLost: lostTotal,
            waves: Object.values(W).filter(w => w.wave <= WAVES).map(w => ({ ...w, spawnAt: w.spawnAt === null ? null : Math.round(w.spawnAt - t0) }))
        };
    }, waves);
}

async function main() {
    const server = spawn(process.execPath, [path.join(ROOT, 'e2e/serve.js')], {
        env: { ...process.env, E2E_PORT: String(PORT) }, stdio: 'ignore'
    });
    await new Promise(r => setTimeout(r, 600));
    const args = process.platform === 'linux' ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] : [];
    const browser = await chromium.launch({ args });
    const results = [];
    try {
        for (const size of SIZES) {
            for (const map of MAPS) {
                const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
                const errors = [];
                page.on('pageerror', e => errors.push(e.message));
                await page.addInitScript(() => {
                    localStorage.setItem('rts_neo_profile_v2', JSON.stringify({ schema: 2, tutorialCompleted: true }));
                    localStorage.setItem('rts_neo_settings_v2', JSON.stringify({ schema: 2, language: 'ru' }));
                });
                await page.goto(`http://127.0.0.1:${PORT}/index.html`);
                await page.waitForFunction(() => typeof startGame === 'function' && typeof renderer !== 'undefined');
                await page.evaluate(([z, m, s, d]) => { setDifficulty(d); setMapSize(z); selectMap(m); setMapSeed(s, true); },
                    [size, map, SEED, DIFFICULTY]);
                await page.getByRole('button', { name: /Играть|Play/ }).click();
                await page.waitForFunction(() => gameStarted === true && units.length > 0);
                const started = Date.now();
                const r = await runInPage(page, WAVES);
                r.size = size; r.map = map; r.seed = SEED; r.difficulty = DIFFICULTY;
                r.wallSeconds = Math.round((Date.now() - started) / 1000);
                r.pageErrors = errors;
                results.push(r);
                console.log(`${size} ${map}: ${r.result}, волн ${r.wavesSeen}, HQ ${r.waves.at(-1)?.hqHpEnd}/${r.hqMaxHp}, ${r.wallSeconds} с`);
                await page.close();
            }
        }
    } finally {
        await browser.close();
        server.kill();
    }
    const payload = { generatedAt: new Date().toISOString(), waves: WAVES, seed: SEED, difficulty: DIFFICULTY, runs: results };
    if (OUT) fs.writeFileSync(path.resolve(ROOT, OUT), JSON.stringify(payload, null, 2) + '\n');
    else process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
