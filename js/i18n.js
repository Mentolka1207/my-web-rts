// =============================================================================
// js/i18n.js — Модуль интернационализации (RU / EN)
// Обеспечивает полную двуязычность интерфейса, оповещений и настроек
// =============================================================================

let currentLanguage = 'ru';

const TRANSLATIONS = {
    ru: {
        // Главное меню
        MENU_TITLE: '🛰️ Minimal Web RTS',
        MENU_SUBTITLE: 'Neo-Drone Swarm & Patrolling AI',
        MENU_PLAY: '▶ Играть',
        MENU_SETTINGS: '⚙️ Настройки',
        MENU_TUTORIAL: '❓ Обучение',
        MENU_RECORDS: '🏆 Рекорды',
        MENU_LICENSES: '📜 Лицензии',
        MENU_EXIT: '✕ Выйти',
        MENU_GITHUB: '📦 Репозиторий на GitHub',
        MENU_EXIT_NOTICE: 'Закройте вкладку вручную (браузер блокирует автозакрытие)',
        MENU_DIFF_LABEL: 'Сложность:',
        MENU_MAP_LABEL: 'Карта:',

        // Сложности
        DIFF_EASY: 'Рекрут (Легко)',
        DIFF_NORMAL: 'Офицер (Норма)',
        DIFF_HARD: 'Командир (Сложно)',

        // Карты
        MAP_CANYON: 'Каньон (Классика)',
        MAP_ARENA: 'Арена Бастионов',
        MAP_MAZE: 'Лабиринт Кристаллов',

        // Кнопки управления вверху
        BTN_HIDE_INSTRUCTIONS: 'Скрыть ▲',
        BTN_SHOW_INSTRUCTIONS: 'Управление ▼',
        SOUND_ON: '🔊 Звук: ВКЛ',
        SOUND_OFF: '🔇 Звук: ВЫКЛ',
        PAUSE_BTN: '⏸️ Пауза',

        // Панель инструкций
        INSTR_TITLE: 'Управление Swarm RTS:',
        INSTR_LINE1: '• <strong>Клик ЛКМ</strong> — выделить одного дрона',
        INSTR_LINE2: '• Зажми <strong>ЛКМ и тяни</strong> — выделить рамкой группу',
        INSTR_LINE3: '• Клик <strong>ПКМ</strong> — переместить рой / фокус-атака врага и штаба',
        INSTR_LINE4: '• <strong>Способности юнитов:</strong>',
        INSTR_LINE5: '&nbsp;&nbsp;⚡ <strong>Форсаж [Q]</strong> (Разведчик) — +80% скорости на 3с',
        INSTR_LINE6: '&nbsp;&nbsp;🛡️ <strong>Щит [E]</strong> (Дрон) — энергобарьер 50 HP на 6с',
        INSTR_LINE7: '&nbsp;&nbsp;⚓ <strong>Осада [R/F]</strong> (Танк) — дальность огня x2, сплэш-урон',
        INSTR_LINE8: '• <strong>Колёсико мыши:</strong> зажми и тяни (MMB) — перемещение карты, крути — зум',
        INSTR_LINE9: '• <strong>Сенсор / Тач:</strong> свайп одним пальцем — перемещение карты, щипок — зум, тап — выбор/приказ',
        INSTR_LINE10: '• <strong>W, A, S, D</strong> — движение камеры, <strong>P / Esc</strong> — пауза',
        INSTR_LINE11: '• <strong>Точки сбора:</strong> захватывай кристаллы на карте (+3⚡/сек за точку)',
        INSTR_LINE12: '• <strong>Волны:</strong> эволюция врагов с волны 3+, Босс «Левиафан» на волне 10!',
        INSTR_FORMATION_TITLE: 'Тактическое построение:',
        FORMATION_LINE: 'Шеренга [Z]',
        FORMATION_WEDGE: 'Клин [X]',
        FORMATION_CIRCLE: 'Кольцо [C]',
        BTN_SPAWN_ENEMY: 'Спавн врага',
        BTN_DEBUG_F3: 'Дебаг (F3)',

        // Панель ресурсов и производства
        RESOURCE_HEADER: '⚡ Энергия:',
        INCOME_SUFFIX: '⚡/сек',
        NODES_STATUS_LABEL: 'Точки сбора:',
        UNIT_DRONE: 'Дрон (70⚡)',
        UNIT_SCOUT: 'Разведчик (40⚡)',
        UNIT_TANK: 'Танк (150⚡)',

        // Волна
        WAVE_LABEL: '🌊 Волна',
        WAVE_NEXT_IN: '— след. через',
        SEC_SHORT: 'с',

        // Сенсор
        TOUCH_PAN: '🖐 Карта (Сенсор)',
        TOUCH_SELECT: '⬚ Рамка (Выбор)',

        // Способности
        ABILITY_SHIELD: 'Щит [E]',
        ABILITY_OVERDRIVE: 'Форсаж [Q]',
        ABILITY_SIEGE: 'Осада [R]',
        STATUS_READY: 'ГОТОВО',
        STATUS_COOLDOWN: 'ОТКАТ',
        STATUS_MOBILE: 'МОБИЛЬНЫЙ',
        STATUS_SIEGED: 'В ОСАДЕ',

        // Оповещения
        ALERT_LEVIATHAN: '⚠️ ВНИМАНИЕ: ВОЛНА {0} — ПРИБЛИЖАЕТСЯ ЛЕВИАФАН!',
        ALERT_SWARM: '🌊 Волна {0}: РОЙ ПЕРЕХВАТЧИКОВ! Приготовьте плотный строй!',
        ALERT_ARMORED: '🌊 Волна {0}: ОСАДНЫЙ ТАРАН! Тяжёлые танки атакуют базу!',
        ALERT_STANDARD: '🌊 Надвигается Волна {0}! Защищайте периметр базы!',
        ALERT_SABOTAGE: '⚠️ ТРЕВОГА: Вражеская группа нацелена на точку «{0}»!',
        ALERT_HQ_ATTACK: '⚠️ ВРАГ АТАКУЕТ НАШ ШТАБ!',
        BOSS_DESTROYED_ALERT: '🏆 БОСС «ЛЕВИАФАН» УНИЧТОЖЕН! (+100⚡)',
        ALERT_NODE_CAPTURED: '💎 Точка «{0}» перешла под наш контроль! (+3⚡/сек)',
        ALERT_NODE_LOST: '⚠️ Противник захватил точку «{0}»!',
        ALERT_WAVE_10S_BOSS: '⚠️ ТРЕВОГА: Приближается БОСС «Левиафан» через 10с!',
        ALERT_WAVE_10S_NORMAL: '🌊 Внимание: Волна {0} начнётся через 10 секунд!',

        // Конец игры
        GAME_OVER_VICTORY: '🏆 ПОБЕДА!',
        GAME_OVER_DEFEAT: '💥 ПОРАЖЕНИЕ',
        STAT_TIME: '⏱️ Время боя:',
        STAT_WAVES_DEFENDED: '🌊 Отражено волн:',
        STAT_KILLED: '💥 Уничтожено врагов:',
        STAT_BOSSES: '👑 Сбито Левиафанов:',
        STAT_ENERGY: '⚡ Добыто энергии:',
        STAT_PRODUCED: '🛸 Произведено дронов:',
        STAT_CAPTURES: '💎 Захватов точек:',
        BTN_PLAY_AGAIN: '▶ Играть снова',
        BTN_TO_MENU: '🏠 В главное меню',

        // Пауза
        PAUSE_TITLE: '⏸️ ПАУЗА',
        BTN_RESUME: '▶ Продолжить',
        BTN_RESTART_MATCH: '🔄 Рестарт матча',

        // Настройки
        SETTINGS_TITLE: '⚙️ НАСТРОЙКИ ИГРЫ',
        LABEL_MASTER_VOL: 'Общая громкость:',
        LABEL_SFX_VOL: 'Звуковые эффекты (SFX):',
        LABEL_MUSIC_VOL: 'Космический эмбиент:',
        LABEL_GRAPHICS: 'Графика и тени:',
        OPT_SHADOWS_ON: 'Мягкие тени (Высокое качество)',
        OPT_SHADOWS_OFF: 'Без теней (Макс. производительность)',
        LABEL_LANGUAGE: 'Язык интерфейса:',
        BTN_SAVE_CLOSE: 'Сохранить и закрыть',

        // Рекорды
        RECORDS_TITLE: '🏆 РЕКОРДЫ И СТАТИСТИКА',
        REC_GAMES: 'Сыграно матчей:',
        REC_WINS: 'Побед:',
        REC_LOSSES: 'Поражений:',
        REC_BEST_WAVE: 'Рекорд волн:',
        REC_MAX_KILLS: 'Максимум сбитых врагов:',
        REC_FASTEST_WIN: 'Самая быстрая победа:',
        REC_EMPTY: 'Пока нет данных. Сыграйте первый матч!',
        BTN_CLOSE: 'Закрыть',

        // Обучение
        TUTORIAL_TITLE: '❓ РУКОВОДСТВО КОМАНДИРА',
        TUT_STEP1_TITLE: '1. ЭНЕРГИЯ И КРИСТАЛЛЫ',
        TUT_STEP1_DESC: 'Энергия — главный ресурс. Захватывай кристаллы Альфа, Центр и Бета на карте. Отправь дронов внутрь кольца захвата: каждая точка приносит +3⚡/сек.',
        TUT_STEP2_TITLE: '2. ПРОИЗВОДСТВО И СТРОЙ',
        TUT_STEP2_DESC: 'Стройте сбалансированную армию: быстрых Разведчиков (40⚡), боевых Дронов (70⚡) и осадные Танки (150⚡). Меняйте построение: Шеренга [Z], Клин [X], Кольцо [C].',
        TUT_STEP3_TITLE: '3. ВОЛНЫ И СПОСОБНОСТИ',
        TUT_STEP3_DESC: 'Каждые 60 сек база врага отправляет волны. Используйте Форсаж [Q] разведчиков, Щит [E] дронов и Осадный режим [R] танков. На волне 10 отразите Босса «Левиафана» и сокрушите вражеский штаб!',
        BTN_TUTORIAL_START: '🚀 Понятно, в бой!',

        // Лицензии
        LICENSES_TITLE: '📜 ЛИЦЕНЗИИ И БЛАГОДАРНОСТИ',
        LICENSES_DESC: 'Minimal Web RTS — открытый проект под лицензией MIT. Вся графика, процедурные PBR-текстуры, 3D-модели и аудиоэффекты созданы автономно на WebGL/Web Audio API.',
        LICENSES_THREE_TITLE: 'Three.js (v0.186.1) — The MIT License',
        LICENSES_THREE_TEXT: 'Copyright © 2010-2026 three.js authors. Разрешено свободное использование, модификация и распространение.'
    },

    en: {
        // Main menu
        MENU_TITLE: '🛰️ Minimal Web RTS',
        MENU_SUBTITLE: 'Neo-Drone Swarm & Patrolling AI',
        MENU_PLAY: '▶ Play',
        MENU_SETTINGS: '⚙️ Settings',
        MENU_TUTORIAL: '❓ Tutorial',
        MENU_RECORDS: '🏆 Records',
        MENU_LICENSES: '📜 Licenses',
        MENU_EXIT: '✕ Exit',
        MENU_GITHUB: '📦 GitHub Repository',
        MENU_EXIT_NOTICE: 'Please close this browser tab manually',
        MENU_DIFF_LABEL: 'Difficulty:',
        MENU_MAP_LABEL: 'Map:',

        // Difficulties
        DIFF_EASY: 'Recruit (Easy)',
        DIFF_NORMAL: 'Officer (Normal)',
        DIFF_HARD: 'Commander (Hard)',

        // Maps
        MAP_CANYON: 'Canyon (Classic)',
        MAP_ARENA: 'Bastion Arena',
        MAP_MAZE: 'Crystal Maze',

        // Top control buttons
        BTN_HIDE_INSTRUCTIONS: 'Hide ▲',
        BTN_SHOW_INSTRUCTIONS: 'Controls ▼',
        SOUND_ON: '🔊 Audio: ON',
        SOUND_OFF: '🔇 Audio: OFF',
        PAUSE_BTN: '⏸️ Pause',

        // Instructions
        INSTR_TITLE: 'Swarm RTS Controls:',
        INSTR_LINE1: '• <strong>LMB Click</strong> — select single unit',
        INSTR_LINE2: '• Hold <strong>LMB & Drag</strong> — box selection',
        INSTR_LINE3: '• <strong>RMB Click</strong> — move swarm / focus-attack enemy or HQ',
        INSTR_LINE4: '• <strong>Unit Abilities:</strong>',
        INSTR_LINE5: '&nbsp;&nbsp;⚡ <strong>Overdrive [Q]</strong> (Scout) — +80% speed for 3s',
        INSTR_LINE6: '&nbsp;&nbsp;🛡️ <strong>Shield [E]</strong> (Drone) — 50 HP barrier for 6s',
        INSTR_LINE7: '&nbsp;&nbsp;⚓ <strong>Siege [R/F]</strong> (Tank) — double range & splash damage',
        INSTR_LINE8: '• <strong>Mouse Wheel:</strong> hold & drag (MMB) to pan, scroll to zoom',
        INSTR_LINE9: '• <strong>Touch / Mobile:</strong> 1-finger swipe to pan, pinch to zoom, tap to order',
        INSTR_LINE10: '• <strong>W, A, S, D</strong> — pan camera, <strong>P / Esc</strong> — pause game',
        INSTR_LINE11: '• <strong>Resource Nodes:</strong> capture crystals (+3⚡/sec per node)',
        INSTR_LINE12: '• <strong>Waves:</strong> evolving enemies from wave 3+, Leviathan Boss on wave 10!',
        INSTR_FORMATION_TITLE: 'Tactical Formations:',
        FORMATION_LINE: 'Line [Z]',
        FORMATION_WEDGE: 'Wedge [X]',
        FORMATION_CIRCLE: 'Circle [C]',
        BTN_SPAWN_ENEMY: 'Spawn Enemy',
        BTN_DEBUG_F3: 'Debug (F3)',

        // Resource and production
        RESOURCE_HEADER: '⚡ Energy:',
        INCOME_SUFFIX: '⚡/sec',
        NODES_STATUS_LABEL: 'Resource Nodes:',
        UNIT_DRONE: 'Drone (70⚡)',
        UNIT_SCOUT: 'Scout (40⚡)',
        UNIT_TANK: 'Tank (150⚡)',

        // Wave
        WAVE_LABEL: '🌊 Wave',
        WAVE_NEXT_IN: '— next in',
        SEC_SHORT: 's',

        // Touch
        TOUCH_PAN: '🖐 Pan Mode',
        TOUCH_SELECT: '⬚ Select Box',

        // Abilities
        ABILITY_SHIELD: 'Shield [E]',
        ABILITY_OVERDRIVE: 'Overdrive [Q]',
        ABILITY_SIEGE: 'Siege [R]',
        STATUS_READY: 'READY',
        STATUS_COOLDOWN: 'COOLDOWN',
        STATUS_MOBILE: 'MOBILE',
        STATUS_SIEGED: 'SIEGED',

        // Alerts
        ALERT_LEVIATHAN: '⚠️ WARNING: WAVE {0} — LEVIATHAN BOSS APPROACHING!',
        ALERT_SWARM: '🌊 Wave {0}: INTERCEPTOR SWARM! Form defensive lines!',
        ALERT_ARMORED: '🌊 Wave {0}: SIEGE BATTERY! Heavy tanks assault our base!',
        ALERT_STANDARD: '🌊 Wave {0} approaching! Defend base perimeter!',
        ALERT_SABOTAGE: '⚠️ ALERT: Enemy strike team targeting node "{0}"!',
        ALERT_HQ_ATTACK: '⚠️ ENEMY IS ATTACKING OUR HQ!',
        BOSS_DESTROYED_ALERT: '🏆 BOSS "LEVIATHAN" DESTROYED! (+100⚡)',
        ALERT_NODE_CAPTURED: '💎 Node "{0}" secured! (+3⚡/sec)',
        ALERT_NODE_LOST: '⚠️ Enemy captured node "{0}"!',
        ALERT_WAVE_10S_BOSS: '⚠️ ALERT: Boss "Leviathan" inbound in 10s!',
        ALERT_WAVE_10S_NORMAL: '🌊 Attention: Wave {0} begins in 10 seconds!',

        // Game over
        GAME_OVER_VICTORY: '🏆 VICTORY!',
        GAME_OVER_DEFEAT: '💥 DEFEAT',
        STAT_TIME: '⏱️ Battle Time:',
        STAT_WAVES_DEFENDED: '🌊 Waves Defeated:',
        STAT_KILLED: '💥 Enemies Destroyed:',
        STAT_BOSSES: '👑 Leviathans Downed:',
        STAT_ENERGY: '⚡ Energy Harvested:',
        STAT_PRODUCED: '🛸 Drones Produced:',
        STAT_CAPTURES: '💎 Nodes Captured:',
        BTN_PLAY_AGAIN: '▶ Play Again',
        BTN_TO_MENU: '🏠 Main Menu',

        // Pause
        PAUSE_TITLE: '⏸️ PAUSE',
        BTN_RESUME: '▶ Resume',
        BTN_RESTART_MATCH: '🔄 Restart Match',

        // Settings
        SETTINGS_TITLE: '⚙️ GAME SETTINGS',
        LABEL_MASTER_VOL: 'Master Volume:',
        LABEL_SFX_VOL: 'Sound Effects (SFX):',
        LABEL_MUSIC_VOL: 'Ambient Music:',
        LABEL_GRAPHICS: 'Graphics & Shadows:',
        OPT_SHADOWS_ON: 'Soft Shadows (High Quality)',
        OPT_SHADOWS_OFF: 'No Shadows (Max Performance)',
        LABEL_LANGUAGE: 'Interface Language:',
        BTN_SAVE_CLOSE: 'Save & Close',

        // Records
        RECORDS_TITLE: '🏆 RECORDS & PROFILE',
        REC_GAMES: 'Matches Played:',
        REC_WINS: 'Victories:',
        REC_LOSSES: 'Defeats:',
        REC_BEST_WAVE: 'Best Wave Defeated:',
        REC_MAX_KILLS: 'Max Enemies Destroyed:',
        REC_FASTEST_WIN: 'Fastest Victory:',
        REC_EMPTY: 'No data yet. Play your first match!',
        BTN_CLOSE: 'Close',

        // Tutorial
        TUTORIAL_TITLE: "❓ COMMANDER'S GUIDE",
        TUT_STEP1_TITLE: '1. ENERGY & RESOURCE NODES',
        TUT_STEP1_DESC: 'Energy powers your army. Capture Alpha, Center, and Beta crystal nodes by moving drones inside capture rings (+3⚡/sec per node).',
        TUT_STEP2_TITLE: '2. PRODUCTION & FORMATIONS',
        TUT_STEP2_DESC: 'Build a balanced swarm: agile Scouts (40⚡), standard Drones (70⚡), and heavy Siege Tanks (150⚡). Switch formations: Line [Z], Wedge [X], Circle [C].',
        TUT_STEP3_TITLE: '3. ABILITIES & DEFENSE',
        TUT_STEP3_DESC: 'Survive incoming waves every 60s. Trigger Scout Overdrive [Q], Drone Shield [E], and Tank Siege mode [R]. Defeat the Leviathan on wave 10 and obliterate the enemy HQ!',
        BTN_TUTORIAL_START: '🚀 Got it, to battle!',

        // Licenses
        LICENSES_TITLE: '📜 LICENSES & CREDITS',
        LICENSES_DESC: 'Minimal Web RTS is an open-source project licensed under MIT. All graphics, procedural PBR textures, 3D models, and sound effects are generated proceduraly via WebGL & Web Audio API.',
        LICENSES_THREE_TITLE: 'Three.js (v0.186.1) — The MIT License',
        LICENSES_THREE_TEXT: 'Copyright © 2010-2026 three.js authors. Free to use, modify, and distribute.'
    }
};

function t(key, ...args) {
    const dict = TRANSLATIONS[currentLanguage] || TRANSLATIONS.ru;
    let str = dict[key] || TRANSLATIONS.ru[key] || key;
    if (args && args.length > 0) {
        args.forEach((val, idx) => {
            str = str.replace(new RegExp(`\\{${idx}\\}`, 'g'), val);
        });
    }
    return str;
}

function setLanguage(lang) {
    if (lang !== 'ru' && lang !== 'en') return;
    currentLanguage = lang;
    if (typeof saveSettingsToStorage === 'function') {
        saveSettingsToStorage();
    }
    updateAllStaticTexts();
}

function getCurrentLanguage() {
    return currentLanguage;
}

function updateAllStaticTexts() {
    // Обновляем все элементы с data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.innerHTML = t(key);
        }
    });

    // Обновляем элементы с data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
            el.title = t(key);
        }
    });

    // Обновляем статус звука
    if (typeof soundEngine !== 'undefined' && soundEngine.updateSoundUI) {
        soundEngine.updateSoundUI();
    }

    // Обновляем панель ресурсов и производство
    if (typeof updateResourceUI === 'function') {
        updateResourceUI();
    }
    // Обновляем панель волны
    if (typeof updateWaveUI === 'function') {
        updateWaveUI();
    }
}
