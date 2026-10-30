// =============================================================================
// js/storage.js — Сохранение настроек и рекордов в localStorage (Schema v2)
// Валидация типов данных, миграция v1->v2 и персистентность рекордов по картам и сложностям
// =============================================================================

const STORAGE_KEY_SETTINGS_V1 = 'rts_neo_settings_v1';
const STORAGE_KEY_PROFILE_V1 = 'rts_neo_profile_v1';

const STORAGE_KEY_SETTINGS = 'rts_neo_settings_v2';
const STORAGE_KEY_PROFILE = 'rts_neo_profile_v2';

const VALID_MAP_IDS = ['canyon', 'arena', 'maze', 'crossroads'];
const VALID_DIFFICULTIES = ['easy', 'normal', 'hard'];
const VALID_LANGUAGES = ['ru', 'en'];

function createEmptyRecord() {
    return {
        wins: 0,
        losses: 0,
        bestWave: 0,
        maxKills: 0,
        fastestWinSec: null
    };
}

function createDefaultRecordsMap() {
    const records = {};
    for (const mapId of VALID_MAP_IDS) {
        records[mapId] = {};
        for (const diff of VALID_DIFFICULTIES) {
            records[mapId][diff] = createEmptyRecord();
        }
    }
    return records;
}

const DEFAULT_SETTINGS = {
    schema: 2,
    masterVolume: 1.0,
    sfxVolume: 1.0,
    musicVolume: 1.0,
    shadows: true,
    language: 'ru',
    difficulty: 'normal',
    mapId: 'canyon'
};

const DEFAULT_PROFILE = {
    schema: 2,
    tutorialCompleted: false,
    totals: {
        matchesPlayed: 0,
        victories: 0,
        defeats: 0,
        energyHarvested: 0,
        bossesKilled: 0
    },
    records: createDefaultRecordsMap()
};

let playerSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let playerProfile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));

// Навешиваем геттеры обратной совместимости для старого кода
function syncProfileCompat() {
    if (!playerProfile.totals) playerProfile.totals = { matchesPlayed: 0, victories: 0, defeats: 0, energyHarvested: 0, bossesKilled: 0 };
    playerProfile.matchesPlayed = playerProfile.totals.matchesPlayed;
    playerProfile.victories = playerProfile.totals.victories;
    playerProfile.defeats = playerProfile.totals.defeats;
    playerProfile.totalEnergyHarvested = playerProfile.totals.energyHarvested;
    playerProfile.totalBossesKilled = playerProfile.totals.bossesKilled;

    // Вычисляем глобальный максимум волн и сбитых врагов по всем картам
    let bestWave = 0;
    let maxKills = 0;
    let fastestWin = null;
    if (playerProfile.records) {
        for (const mapId in playerProfile.records) {
            for (const diff in playerProfile.records[mapId]) {
                const rec = playerProfile.records[mapId][diff];
                if (rec.bestWave > bestWave) bestWave = rec.bestWave;
                if (rec.maxKills > maxKills) maxKills = rec.maxKills;
                if (rec.fastestWinSec !== null) {
                    if (fastestWin === null || rec.fastestWinSec < fastestWin) {
                        fastestWin = rec.fastestWinSec;
                    }
                }
            }
        }
    }
    playerProfile.bestWave = bestWave;
    playerProfile.maxEnemiesKilled = maxKills;
    playerProfile.fastestWinSec = fastestWin;
}

/**
 * Валидатор и санитайзер настроек Settings v2
 */
function validateAndSanitizeSettings(raw) {
    if (!raw || typeof raw !== 'object') {
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }

    const clamp = (val, min, max, def) => {
        const n = parseFloat(val);
        return (!isNaN(n) && isFinite(n)) ? Math.max(min, Math.min(max, n)) : def;
    };

    return {
        schema: 2,
        masterVolume: clamp(raw.masterVolume, 0, 1, 1.0),
        sfxVolume: clamp(raw.sfxVolume, 0, 1, 1.0),
        musicVolume: clamp(raw.musicVolume, 0, 1, 1.0),
        shadows: typeof raw.shadows === 'boolean' ? raw.shadows : true,
        language: VALID_LANGUAGES.includes(raw.language) ? raw.language : 'ru',
        difficulty: VALID_DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'normal',
        mapId: VALID_MAP_IDS.includes(raw.mapId) ? raw.mapId : 'canyon'
    };
}

/**
 * Валидатор и санитайзер профиля Profile v2
 */
function validateAndSanitizeProfile(raw) {
    if (!raw || typeof raw !== 'object') {
        return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    }

    const sanitized = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    sanitized.tutorialCompleted = Boolean(raw.tutorialCompleted);

    const safeInt = (val) => {
        const n = parseInt(val, 10);
        return (!isNaN(n) && isFinite(n) && n >= 0) ? n : 0;
    };

    if (raw.totals && typeof raw.totals === 'object') {
        sanitized.totals.matchesPlayed = safeInt(raw.totals.matchesPlayed);
        sanitized.totals.victories = safeInt(raw.totals.victories);
        sanitized.totals.defeats = safeInt(raw.totals.defeats);
        sanitized.totals.energyHarvested = safeInt(raw.totals.energyHarvested);
        sanitized.totals.bossesKilled = safeInt(raw.totals.bossesKilled);
    }

    if (raw.records && typeof raw.records === 'object') {
        for (const mapId of VALID_MAP_IDS) {
            if (raw.records[mapId] && typeof raw.records[mapId] === 'object') {
                for (const diff of VALID_DIFFICULTIES) {
                    const r = raw.records[mapId][diff];
                    if (r && typeof r === 'object') {
                        const target = sanitized.records[mapId][diff];
                        target.wins = safeInt(r.wins);
                        target.losses = safeInt(r.losses);
                        target.bestWave = safeInt(r.bestWave);
                        target.maxKills = safeInt(r.maxKills);
                        if (r.fastestWinSec !== null && r.fastestWinSec !== undefined) {
                            const f = parseFloat(r.fastestWinSec);
                            target.fastestWinSec = (!isNaN(f) && isFinite(f) && f >= 0) ? f : null;
                        } else {
                            target.fastestWinSec = null;
                        }
                    }
                }
            }
        }
    }

    return sanitized;
}

/**
 * Миграция данных v1 -> v2
 */
function migrateStorageV1toV2() {
    try {
        // Миграция настроек
        if (typeof localStorage !== 'undefined' && !localStorage.getItem(STORAGE_KEY_SETTINGS)) {
            const rawV1 = localStorage.getItem(STORAGE_KEY_SETTINGS_V1);
            if (rawV1) {
                const parsedV1 = JSON.parse(rawV1);
                const migrated = validateAndSanitizeSettings(parsedV1);
                localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(migrated));
                localStorage.removeItem(STORAGE_KEY_SETTINGS_V1);
            }
        }

        // Миграция профиля игрока
        if (typeof localStorage !== 'undefined' && !localStorage.getItem(STORAGE_KEY_PROFILE)) {
            const rawProfV1 = localStorage.getItem(STORAGE_KEY_PROFILE_V1);
            if (rawProfV1) {
                const p1 = JSON.parse(rawProfV1);
                const migratedProf = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                migratedProf.tutorialCompleted = Boolean(p1.tutorialCompleted);
                migratedProf.totals.matchesPlayed = p1.matchesPlayed || 0;
                migratedProf.totals.victories = p1.victories || 0;
                migratedProf.totals.defeats = p1.defeats || 0;
                migratedProf.totals.energyHarvested = p1.totalEnergyHarvested || 0;
                migratedProf.totals.bossesKilled = p1.totalBossesKilled || 0;

                // Переносим общие рекорды v1 в canyon:normal
                const rec = migratedProf.records.canyon.normal;
                rec.wins = p1.victories || 0;
                rec.losses = p1.defeats || 0;
                rec.bestWave = p1.bestWave || 0;
                rec.maxKills = p1.maxEnemiesKilled || 0;
                rec.fastestWinSec = (typeof p1.fastestWinSec === 'number') ? p1.fastestWinSec : null;

                localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(migratedProf));
                localStorage.removeItem(STORAGE_KEY_PROFILE_V1);
            }
        }
    } catch (e) {
        console.warn('[Storage] Ошибка миграции хранилища v1->v2:', e);
    }
}

function loadSettingsFromStorage() {
    migrateStorageV1toV2();

    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
            if (raw) {
                playerSettings = validateAndSanitizeSettings(JSON.parse(raw));
            }
        }
    } catch (e) {
        console.warn('[Storage] Не удалось прочитать настройки из localStorage:', e);
    }

    // Применяем загруженные настройки
    if (typeof setLanguage === 'function') {
        currentLanguage = playerSettings.language || 'ru';
    }

    if (typeof soundEngine !== 'undefined') {
        if (soundEngine.setMasterVolume) soundEngine.setMasterVolume(playerSettings.masterVolume);
        if (soundEngine.setSfxVolume) soundEngine.setSfxVolume(playerSettings.sfxVolume);
        if (soundEngine.setMusicVolume) soundEngine.setMusicVolume(playerSettings.musicVolume);
    }

    if (typeof setShadowsEnabled === 'function') {
        setShadowsEnabled(playerSettings.shadows);
    }

    if (typeof setDifficulty === 'function') {
        setDifficulty(playerSettings.difficulty, false);
    }

    if (typeof selectMap === 'function') {
        selectMap(playerSettings.mapId, false);
    }

    return playerSettings;
}

function saveSettingsToStorage() {
    try {
        if (typeof currentLanguage !== 'undefined') {
            playerSettings.language = currentLanguage;
        }
        playerSettings = validateAndSanitizeSettings(playerSettings);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(playerSettings));
        }
    } catch (e) {
        console.warn('[Storage] Ошибка записи настроек в localStorage:', e);
    }
}

function loadProfileFromStorage() {
    migrateStorageV1toV2();

    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
            if (raw) {
                playerProfile = validateAndSanitizeProfile(JSON.parse(raw));
            }
        }
    } catch (e) {
        console.warn('[Storage] Ошибка чтения профиля из localStorage:', e);
    }

    syncProfileCompat();
    return playerProfile;
}

function saveProfileToStorage() {
    try {
        playerProfile = validateAndSanitizeProfile(playerProfile);
        syncProfileCompat();
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(playerProfile));
        }
    } catch (e) {
        console.warn('[Storage] Ошибка сохранения профиля в localStorage:', e);
    }
}

/**
 * Запись результатов матча в профиль (по карте и сложности + в totals)
 */
function recordMatchResult(isVictory, stats, durationSec, wavesDefeated) {
    if (!playerProfile || !playerProfile.totals) {
        loadProfileFromStorage();
    }

    // 1. Обновляем глобальные итоги (totals)
    playerProfile.totals.matchesPlayed++;
    if (isVictory) {
        playerProfile.totals.victories++;
    } else {
        playerProfile.totals.defeats++;
    }

    playerProfile.totals.energyHarvested += Math.floor(stats.energyHarvested || 0);
    playerProfile.totals.bossesKilled += (stats.bossesKilled || 0);

    // 2. Обновляем рекорды для конкретной связки [карта][сложность]
    const mapKey = (typeof currentMapId !== 'undefined' && VALID_MAP_IDS.includes(currentMapId)) ? currentMapId : 'canyon';
    const diffKey = (typeof currentDifficulty !== 'undefined' && VALID_DIFFICULTIES.includes(currentDifficulty)) ? currentDifficulty : 'normal';

    if (!playerProfile.records[mapKey]) playerProfile.records[mapKey] = {};
    if (!playerProfile.records[mapKey][diffKey]) playerProfile.records[mapKey][diffKey] = createEmptyRecord();

    const record = playerProfile.records[mapKey][diffKey];
    if (isVictory) {
        record.wins++;
        if (record.fastestWinSec === null || durationSec < record.fastestWinSec) {
            record.fastestWinSec = durationSec;
        }
    } else {
        record.losses++;
    }

    if (wavesDefeated > record.bestWave) {
        record.bestWave = wavesDefeated;
    }

    if (stats.enemiesKilled > record.maxKills) {
        record.maxKills = stats.enemiesKilled;
    }

    saveProfileToStorage();
}
