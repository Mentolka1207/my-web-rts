// =============================================================================
// js/storage.js — Сохранение настроек и рекордов в localStorage
// Обеспечивает персистентность пользовательского профиля и конфигурации
// =============================================================================

const STORAGE_KEY_SETTINGS = 'rts_neo_settings_v1';
const STORAGE_KEY_PROFILE = 'rts_neo_profile_v1';

let playerSettings = {
    masterVolume: 1.0,
    sfxVolume: 1.0,
    musicVolume: 1.0,
    shadows: true,
    language: 'ru',
    difficulty: 'normal',
    mapId: 'canyon'
};

let playerProfile = {
    matchesPlayed: 0,
    victories: 0,
    defeats: 0,
    bestWave: 0,
    maxEnemiesKilled: 0,
    fastestWinSec: null,
    totalEnergyHarvested: 0,
    totalBossesKilled: 0,
    tutorialCompleted: false
};

function loadSettingsFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (raw) {
            const parsed = JSON.parse(raw);
            playerSettings = Object.assign(playerSettings, parsed);
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
}

function saveSettingsToStorage() {
    try {
        playerSettings.language = currentLanguage;
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(playerSettings));
    } catch (e) {
        console.warn('[Storage] Ошибка записи настроек в localStorage:', e);
    }
}

function loadProfileFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
        if (raw) {
            const parsed = JSON.parse(raw);
            playerProfile = Object.assign(playerProfile, parsed);
        }
    } catch (e) {
        console.warn('[Storage] Ошибка чтения профиля из localStorage:', e);
    }
    return playerProfile;
}

function saveProfileToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(playerProfile));
    } catch (e) {
        console.warn('[Storage] Ошибка сохранения профиля в localStorage:', e);
    }
}

// Запись результатов матча в профиль
function recordMatchResult(isVictory, stats, durationSec, wavesDefeated) {
    playerProfile.matchesPlayed++;
    if (isVictory) {
        playerProfile.victories++;
        if (playerProfile.fastestWinSec === null || durationSec < playerProfile.fastestWinSec) {
            playerProfile.fastestWinSec = durationSec;
        }
    } else {
        playerProfile.defeats++;
    }

    if (wavesDefeated > playerProfile.bestWave) {
        playerProfile.bestWave = wavesDefeated;
    }

    if (stats.enemiesKilled > playerProfile.maxEnemiesKilled) {
        playerProfile.maxEnemiesKilled = stats.enemiesKilled;
    }

    playerProfile.totalEnergyHarvested += (stats.energyHarvested || 0);
    playerProfile.totalBossesKilled += (stats.bossesKilled || 0);

    saveProfileToStorage();
}
