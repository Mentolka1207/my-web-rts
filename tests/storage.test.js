import { describe, it, expect, beforeEach } from 'vitest';
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadStorageContext(initialLocalStorage = {}) {
    const store = { ...initialLocalStorage };
    const mockLocalStorage = {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { for (const k in store) delete store[k]; },
        get store() { return store; }
    };

    const ctx = vm.createContext({
        console,
        localStorage: mockLocalStorage,
        currentLanguage: 'ru',
        currentMapId: 'canyon',
        currentDifficulty: 'normal',
        VALID_MAP_IDS: ['canyon', 'arena', 'maze', 'crossroads'],
        VALID_DIFFICULTIES: ['easy', 'normal', 'hard']
    });
    ctx.globalThis = ctx;

    const storageCode = fs.readFileSync(path.join(ROOT, 'js', 'storage.js'), 'utf8');
    vm.runInContext(storageCode, ctx);

    return vm.runInContext(`({
        validateAndSanitizeSettings,
        validateAndSanitizeProfile,
        migrateStorageV1toV2,
        loadSettingsFromStorage,
        saveSettingsToStorage,
        loadProfileFromStorage,
        saveProfileToStorage,
        recordMatchResult,
        get playerSettings() { return playerSettings; },
        set playerSettings(v) { playerSettings = v; },
        get playerProfile() { return playerProfile; },
        set playerProfile(v) { playerProfile = v; },
        get currentMapId() { return currentMapId; },
        set currentMapId(v) { currentMapId = v; },
        get currentDifficulty() { return currentDifficulty; },
        set currentDifficulty(v) { currentDifficulty = v; },
        localStorage
    })`, ctx);
}

describe('Storage Schema v2, валидация и миграция (js/storage.js)', () => {
    it('санитизирует невалидные и поврежденные настройки Settings v2', () => {
        const ctx = loadStorageContext();
        const { validateAndSanitizeSettings } = ctx;

        // Поврежденный объект с некорректными типами
        const broken = {
            masterVolume: 'abc',
            sfxVolume: -5,
            musicVolume: 10,
            shadows: 'not-a-bool',
            language: 'es',
            difficulty: 'nightmare',
            mapId: 'secret_base'
        };

        const res = validateAndSanitizeSettings(broken);
        expect(res.schema).toBe(2);
        expect(res.masterVolume).toBe(1.0); // дефолт
        expect(res.sfxVolume).toBe(0);      // ограничено min
        expect(res.musicVolume).toBe(1);    // ограничено max
        expect(res.shadows).toBe(true);     // дефолт
        expect(res.language).toBe('ru');    // fallback
        expect(res.difficulty).toBe('normal'); // fallback
        expect(res.mapId).toBe('canyon');   // fallback
    });

    it('корректно валидирует и структурирует профиль Profile v2', () => {
        const ctx = loadStorageContext();
        const { validateAndSanitizeProfile } = ctx;

        const raw = {
            schema: 2,
            tutorialCompleted: 1,
            totals: {
                matchesPlayed: '15',
                victories: 10,
                defeats: '5',
                energyHarvested: 2450.5,
                bossesKilled: -3
            },
            records: {
                arena: {
                    hard: {
                        wins: 2,
                        losses: 1,
                        bestWave: 12,
                        maxKills: 45,
                        fastestWinSec: 184.2
                    }
                }
            }
        };

        const res = validateAndSanitizeProfile(raw);
        expect(res.schema).toBe(2);
        expect(res.tutorialCompleted).toBe(true);
        expect(res.totals.matchesPlayed).toBe(15);
        expect(res.totals.victories).toBe(10);
        expect(res.totals.defeats).toBe(5);
        expect(res.totals.energyHarvested).toBe(2450);
        expect(res.totals.bossesKilled).toBe(0); // отрицательное обнулено
        expect(res.records.arena.hard.wins).toBe(2);
        expect(res.records.arena.hard.bestWave).toBe(12);
        expect(res.records.arena.hard.fastestWinSec).toBe(184.2);
        // Не указанные карты заполняются нулевыми рекордами
        expect(res.records.canyon.normal.wins).toBe(0);
    });

    it('мигрирует устаревшие ключи v1 (rts_neo_settings_v1 / rts_neo_profile_v1) в v2', () => {
        const v1Settings = {
            masterVolume: 0.7,
            sfxVolume: 0.8,
            musicVolume: 0.5,
            shadows: false,
            language: 'en',
            difficulty: 'hard',
            mapId: 'arena'
        };

        const v1Profile = {
            matchesPlayed: 8,
            victories: 6,
            defeats: 2,
            bestWave: 14,
            maxEnemiesKilled: 68,
            fastestWinSec: 210,
            totalEnergyHarvested: 3200,
            totalBossesKilled: 2,
            tutorialCompleted: true
        };

        const ctx = loadStorageContext({
            'rts_neo_settings_v1': JSON.stringify(v1Settings),
            'rts_neo_profile_v1': JSON.stringify(v1Profile)
        });

        // Запуск миграции
        ctx.migrateStorageV1toV2();

        // Проверяем удаление v1
        expect(ctx.localStorage.getItem('rts_neo_settings_v1')).toBeNull();
        expect(ctx.localStorage.getItem('rts_neo_profile_v1')).toBeNull();

        // Проверяем сохранение в v2
        const s2Raw = ctx.localStorage.getItem('rts_neo_settings_v2');
        expect(s2Raw).not.toBeNull();
        const s2 = JSON.parse(s2Raw);
        expect(s2.schema).toBe(2);
        expect(s2.masterVolume).toBe(0.7);
        expect(s2.language).toBe('en');

        const p2Raw = ctx.localStorage.getItem('rts_neo_profile_v2');
        expect(p2Raw).not.toBeNull();
        const p2 = JSON.parse(p2Raw);
        expect(p2.schema).toBe(2);
        expect(p2.totals.matchesPlayed).toBe(8);
        expect(p2.totals.victories).toBe(6);
        expect(p2.records.canyon.normal.bestWave).toBe(14);
        expect(p2.records.canyon.normal.maxKills).toBe(68);
        expect(p2.records.canyon.normal.fastestWinSec).toBe(210);
    });

    it('recordMatchResult обновляет totals и изолированные рекорды для конкретной карты и сложности', () => {
        const ctx = loadStorageContext();
        ctx.loadProfileFromStorage();

        // Устанавливаем текущую карту и сложность
        ctx.currentMapId = 'maze';
        ctx.currentDifficulty = 'hard';

        // 1-й матч: Победа
        ctx.recordMatchResult(true, { energyHarvested: 500, enemiesKilled: 30, bossesKilled: 1 }, 120, 10);

        let prof = ctx.playerProfile;
        expect(prof.totals.matchesPlayed).toBe(1);
        expect(prof.totals.victories).toBe(1);
        expect(prof.totals.defeats).toBe(0);
        expect(prof.totals.energyHarvested).toBe(500);
        expect(prof.totals.bossesKilled).toBe(1);

        const mazeHard = prof.records.maze.hard;
        expect(mazeHard.wins).toBe(1);
        expect(mazeHard.losses).toBe(0);
        expect(mazeHard.bestWave).toBe(10);
        expect(mazeHard.maxKills).toBe(30);
        expect(mazeHard.fastestWinSec).toBe(120);

        // Другие карты остаются нетронутыми
        expect(prof.records.canyon.normal.wins).toBe(0);

        // 2-й матч на Canyon Normal: Поражение на волне 5
        ctx.currentMapId = 'canyon';
        ctx.currentDifficulty = 'normal';
        ctx.recordMatchResult(false, { energyHarvested: 200, enemiesKilled: 15, bossesKilled: 0 }, 80, 5);

        prof = ctx.playerProfile;
        expect(prof.totals.matchesPlayed).toBe(2);
        expect(prof.totals.victories).toBe(1);
        expect(prof.totals.defeats).toBe(1);

        const canyonNormal = prof.records.canyon.normal;
        expect(canyonNormal.wins).toBe(0);
        expect(canyonNormal.losses).toBe(1);
        expect(canyonNormal.bestWave).toBe(5);
        expect(canyonNormal.maxKills).toBe(15);
        expect(canyonNormal.fastestWinSec).toBeNull();
    });
});
