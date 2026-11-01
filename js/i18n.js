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
        MENU_MAP_SIZE_LABEL: 'Размер:',
        MENU_SEED_LABEL: 'Сид (Seed):',
        MENU_SEED_ARIA: 'Сид генерации карты',
        MENU_SEED_REROLL_TITLE: 'Сгенерировать случайный сид',

        // Размеры карт
        MAP_SIZE_256: '256×256 (Малая)',
        MAP_SIZE_512: '512×512 (Средняя)',
        MAP_SIZE_1024: '1024×1024 (Большая)',

        // Сложности
        DIFF_EASY: 'Рекрут (Легко)',
        DIFF_NORMAL: 'Офицер (Норма)',
        DIFF_HARD: 'Командир (Сложно)',

        // Карты
        MAP_CANYON: 'Каньон (Классика)',
        MAP_ARENA: 'Арена Бастионов',
        MAP_MAZE: 'Лабиринт Кристаллов',
        MAP_CROSSROADS: 'Перекрёсток (Тактика)',

        // Ресурсные точки
        NODE_ALPHA: 'Альфа',
        NODE_CENTER: 'Центр',
        NODE_BETA: 'Бета',
        NODE_GAMMA: 'Гамма',
        NODE_DELTA: 'Дельта',
        NODE_EPSILON: 'Эпсилон',
        NODE_ZETA: 'Дзета',
        NODE_ETA: 'Эта',
        NODE_THETA: 'Тета',

        // Оповещения способностей и статусы
        ALERT_OVERDRIVE: '⚡ ФОРСАЖ: {0} Разведч. ускорились (+80%)!',
        ALERT_SIEGE_ON: '⚓ ОСАДА ВКЛЮЧЕНА ({0} Танков зафиксировано)!',
        ALERT_SIEGE_OFF: '🚜 МОБИЛЬНЫЙ РЕЖИМ ({0} Танков снялись с якоря)!',
        ALERT_SIEGE_SWITCH: '⚓ РЕЖИМ ОСАДЫ ПЕРЕКЛЮЧЁН ({0} Танков)!',
        ALERT_SHIELD: '🛡️ ЭНЕРГОЩИТ активирован ({0} Дронов)!',
        ABILITY_READY: 'ГОТОВО',
        ABILITY_ACTIVE: 'АКТИВНО',
        ABILITY_CD: 'КД',
        ABILITY_SIEGE_ON: 'ОСАДА (ВКЛ)',
        ABILITY_MOBILE: 'МОБИЛЬНЫЙ',

        // Кнопки управления вверху
        BTN_HIDE_INSTRUCTIONS: 'Скрыть ▲',
        BTN_SHOW_INSTRUCTIONS: 'Управление ▼',
        SOUND_ON: '🔊 Звук: ВКЛ',
        SOUND_OFF: '🔇 Звук: ВЫКЛ',
        PAUSE_BTN: '⏸️ Пауза',

        // Панель инструкций
        INSTR_TITLE: 'Управление Swarm RTS:',
        INSTR_LINE1: '<strong>Клик ЛКМ</strong> — выбор юнита; <strong>2× клик</strong> — выбрать всех юнитов этого типа',
        INSTR_LINE2: 'Зажми <strong>ЛКМ и тяни</strong> — рамка выделения группы; <strong>Ctrl+A</strong> — вся армия',
        INSTR_LINE3: 'Клик <strong>ПКМ</strong> — приказ перемещения по Flow Field / фокус-атака врагов и штаба',
        INSTR_LINE4: '<strong>Способности юнитов (клавиши Q, E, R или 1, 2, 3):</strong>',
        INSTR_LINE5: '⚡ <strong>Форсаж [Q / 2]</strong> (Разведчик) — +80% скорости на 3с (кд 10с)',
        INSTR_LINE6: '🛡️ <strong>Щит [E / 1]</strong> (Дрон) — энергобарьер 50 HP на 6с (кд 12с)',
        INSTR_LINE7: '⚓ <strong>Осада [R/F / 3]</strong> (Танк) — дальность огня ×2, сплэш-урон по площади (кд 2.5с)',
        INSTR_LINE8: '<strong>Камера:</strong> W, A, S, D (+Shift — ускорение), <strong>Space</strong> — центрировать на армию, <strong>H</strong> — на базу',
        INSTR_LINE9: '<strong>Мышь:</strong> зажатое колёсико (MMB) — панорама карты 1:1, вращение — зум',
        INSTR_LINE10: '<strong>Сенсор / Тач:</strong> переключатель [Карта/Рамка], свайп — панорама, щипок — зум, тап — выбор/приказ',
        INSTR_LINE11: '<strong>Тактика и строй:</strong> шеренга [Z], клин [X], кольцо [C]; захват точек кристаллов (+3⚡/сек)',
        INSTR_LINE12: '<strong>Карты и масштабы:</strong> 256/512/1024 на шуме Перлина, сиды + 🎲, стресс-тесты до 5000×5000 (F3)',
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
        REC_TOTALS: '📊 Общая статистика',
        REC_BY_MAP: '🗺️ Рекорды по картам',
        REC_GAMES: 'Сыграно матчей:',
        REC_WINS: 'Побед:',
        REC_LOSSES: 'Поражений:',
        REC_BEST_WAVE: 'Рекорд волн:',
        REC_MAX_KILLS: 'Максимум сбитых врагов:',
        REC_FASTEST_WIN: 'Самая быстрая победа:',
        REC_TOTAL_ENERGY: 'Добыто энергии:',
        REC_TOTAL_BOSSES: 'Сбито боссов:',
        REC_FILTER_MAP: 'Карта:',
        REC_FILTER_DIFF: 'Сложность:',
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
        LICENSES_THREE_TEXT: 'Copyright © 2010-2026 three.js authors. Разрешено свободное использование, модификация и распространение.',
        // Сборка UI 2026-10-31: доступность, HUD, профайлер, экран ошибки
        HUD_CONTROLS: 'Управление',
        HUD_RESOURCES: 'Ресурсы',
        HUD_ABILITIES: 'Способности выделенных юнитов',
        HUD_MINIMAP: 'Миникарта: нажмите, чтобы перенести камеру',
        BTN_HIDE: 'Скрыть',
        BTN_SHOW: 'Управление',
        SOUND_LABEL_ON: 'Звук: вкл',
        SOUND_LABEL_OFF: 'Звук: выкл',
        PAUSE_LABEL: 'Пауза',
        RESUME_LABEL: 'Продолжить',
        FORMATION_GROUP: 'Построение отряда',
        BTN_FPS_PANEL: 'FPS-панель (`)',
        TOUCH_MODE_LABEL: 'Режим касания',
        ABILITY_ARIA: '{0}: {1}',
        ERR_TITLE: '🚨 Сбой в коде игры',
        ERR_UNKNOWN: 'Неизвестная ошибка',
        ERR_SOURCE: 'Где: {0}',
        DBG_TITLE: '🛠️ Профайлер (F3)',
        DBG_CLOSE: 'Закрыть профайлер',
        DBG_SEC_RENDER: 'Рендер и кадр',
        DBG_SEC_SUBSYSTEMS: 'Подсистемы, мс за тик',
        DBG_SEC_COLLISIONS: 'Алгоритм коллизий',
        DBG_SEC_INSTANCING: 'Инстансинг и симуляция',
        DBG_SEC_BENCH: 'Стресс-тест в узких проходах',
        DBG_SEC_ASSETS: 'Размер и ассеты',
        DBG_FPS: 'FPS:',
        DBG_FRAME: 'Время кадра:',
        DBG_TICK: 'Тик JS (всего):',
        DBG_DRAW_CALLS: 'Вызовы отрисовки:',
        DBG_TRIANGLES: 'Треугольники:',
        DBG_UNITS: 'Юниты (свои / враги):',
        DBG_SELECTED: 'Выделено:',
        DBG_FLOW: '🌊 Flow Field (BFS):',
        DBG_SPATIAL: '⬡ Spatial hash и коллизии:',
        DBG_FSM: '🤖 FSM и способности:',
        DBG_AUDIO: '🔊 Синтез Web Audio:',
        DBG_VOICES_LABEL: '↳ голоса:',
        DBG_VOICES: '{0} акт. / {1} соб.',
        DBG_RENDER: '🎨 Рендер Three.js:',
        DBG_PAIRS: 'Проверок пар за кадр:',
        DBG_SIM_CORE: 'Где идёт симуляция:',
        DBG_SIM_MAIN: 'главный поток',
        DBG_BENCH_STATUS: 'Статус теста:',
        DBG_BENCH_OFF: 'выкл',
        DBG_BENCH_ON: 'идёт ({0} юн.)',
        DBG_BENCH_RESET: '⏹️ Сбросить',
        DBG_CODE_SIZE: 'Код игры (JS + CSS + HTML):',
        DBG_THREE_SIZE: 'Three.js:',
        DBG_EXTERNAL: 'Внешние текстуры и звуки:',
        DBG_EXTERNAL_VAL: '0 файлов',
        DBG_NA: 'н/д (file://)',
        DBG_COLL_SPATIAL: '⬡ Spatial Grid O(N)',
        DBG_COLL_NAIVE: '⚠️ Перебор всех пар O(N²)',
        DBG_COLL_SPATIAL_TIP: 'Хеш-сетка: проверяются только соседние ячейки',
        DBG_COLL_NAIVE_TIP: 'Каждая пара юнитов: FPS резко падает',
        DBG_INST_ON: '⚡ GPU-инстансинг: вкл',
        DBG_INST_OFF: '🐌 Отдельные меши: инстансинг выкл',
        DBG_INST_ON_TIP: 'Юниты и полоски HP рисуются общими InstancedMesh',
        DBG_INST_OFF_TIP: 'У каждого юнита свой меш: вызовов отрисовки намного больше',
        ALERT_COLL_NAIVE: '⚠️ Коллизии: перебор всех пар O(N²). Ждите просадку FPS.',
        ALERT_COLL_SPATIAL: '⬡ Коллизии: хеш-сетка O(N).',
        ALERT_INST_ON: '⚡ GPU-инстансинг включён: вызовов отрисовки меньше.',
        ALERT_INST_OFF: '🐌 Отдельные меши: вызовов отрисовки и нагрузки больше.',
        PERF_FPS: 'FPS',
        PERF_FRAME: 'Кадр (сред. / макс.)',
        PERF_UNITS: 'Юниты (свои / враги)',
        PERF_THREADS: 'Потоки CPU',
        DBG_THREADS: 'Многопоточность (Web Workers):',
        UNITS_TOTAL: '{0} / {1} (всего {2})',
        STATS_TITLE: 'Итоги боя',
        ABILITY_SHIELD_NAME: 'Щит',
        ABILITY_OVERDRIVE_NAME: 'Форсаж',
        ABILITY_SIEGE_NAME: 'Осада'
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
        MENU_MAP_SIZE_LABEL: 'Map Size:',
        MENU_SEED_LABEL: 'Map Seed:',
        MENU_SEED_ARIA: 'Map generation seed',
        MENU_SEED_REROLL_TITLE: 'Generate random seed',

        // Map Sizes
        MAP_SIZE_256: '256×256 (Small)',
        MAP_SIZE_512: '512×512 (Medium)',
        MAP_SIZE_1024: '1024×1024 (Large)',

        // Difficulties
        DIFF_EASY: 'Recruit (Easy)',
        DIFF_NORMAL: 'Officer (Normal)',
        DIFF_HARD: 'Commander (Hard)',

        // Maps
        MAP_CANYON: 'Canyon (Classic)',
        MAP_ARENA: 'Bastion Arena',
        MAP_MAZE: 'Crystal Maze',
        MAP_CROSSROADS: 'Crossroads (Tactical)',

        // Resource Nodes
        NODE_ALPHA: 'Alpha',
        NODE_CENTER: 'Center',
        NODE_BETA: 'Beta',
        NODE_GAMMA: 'Gamma',
        NODE_DELTA: 'Delta',
        NODE_EPSILON: 'Epsilon',
        NODE_ZETA: 'Zeta',
        NODE_ETA: 'Eta',
        NODE_THETA: 'Theta',

        // Ability Alerts & Statuses
        ALERT_OVERDRIVE: '⚡ OVERDRIVE: {0} Scouts accelerated (+80%)!',
        ALERT_SIEGE_ON: '⚓ SIEGE MODE ON ({0} Tanks anchored)!',
        ALERT_SIEGE_OFF: '🚜 MOBILE MODE ({0} Tanks mobile)!',
        ALERT_SIEGE_SWITCH: '⚓ SIEGE TOGGLED ({0} Tanks)!',
        ALERT_SHIELD: '🛡️ ENERGY SHIELD active ({0} Drones)!',
        ABILITY_READY: 'READY',
        ABILITY_ACTIVE: 'ACTIVE',
        ABILITY_CD: 'CD',
        ABILITY_SIEGE_ON: 'SIEGE (ON)',
        ABILITY_MOBILE: 'MOBILE',

        // Top control buttons
        BTN_HIDE_INSTRUCTIONS: 'Hide ▲',
        BTN_SHOW_INSTRUCTIONS: 'Controls ▼',
        SOUND_ON: '🔊 Audio: ON',
        SOUND_OFF: '🔇 Audio: OFF',
        PAUSE_BTN: '⏸️ Pause',

        // Instructions
        INSTR_TITLE: 'Swarm RTS Controls:',
        INSTR_LINE1: '<strong>LMB Click</strong> — select unit; <strong>Double Click</strong> — select all units of this type',
        INSTR_LINE2: 'Hold <strong>LMB & Drag</strong> — box selection; <strong>Ctrl+A</strong> — select entire army',
        INSTR_LINE3: '<strong>RMB Click</strong> — Flow Field movement / focus-attack enemy drones or HQ',
        INSTR_LINE4: '<strong>Unit Abilities (Hotkeys Q, E, R or 1, 2, 3):</strong>',
        INSTR_LINE5: '⚡ <strong>Overdrive [Q / 2]</strong> (Scout) — +80% speed for 3s (10s CD)',
        INSTR_LINE6: '🛡️ <strong>Shield [E / 1]</strong> (Drone) — 50 HP energy barrier for 6s (12s CD)',
        INSTR_LINE7: '⚓ <strong>Siege [R/F / 3]</strong> (Tank) — 2x weapon range & splash AoE (2.5s CD)',
        INSTR_LINE8: '<strong>Camera:</strong> W, A, S, D (+Shift to sprint), <strong>Space</strong> — center on army, <strong>H</strong> — center on HQ',
        INSTR_LINE9: '<strong>Mouse:</strong> hold & drag wheel (MMB) to pan 1:1, scroll to zoom',
        INSTR_LINE10: '<strong>Touch / Mobile:</strong> [Pan/Box] mode, swipe to pan, pinch-zoom, tap for order',
        INSTR_LINE11: '<strong>Tactics & Formations:</strong> Line [Z], Wedge [X], Circle [C]; capture crystal nodes (+3⚡/sec)',
        INSTR_LINE12: '<strong>Maps & Scales:</strong> 256/512/1024 via Perlin noise, seeds + 🎲, swarm tests up to 5000×5000 (F3)',
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
        REC_TOTALS: '📊 Total Statistics',
        REC_BY_MAP: '🗺️ Records by Map',
        REC_GAMES: 'Matches Played:',
        REC_WINS: 'Victories:',
        REC_LOSSES: 'Defeats:',
        REC_BEST_WAVE: 'Best Wave Defeated:',
        REC_MAX_KILLS: 'Max Enemies Destroyed:',
        REC_FASTEST_WIN: 'Fastest Victory:',
        REC_TOTAL_ENERGY: 'Total energy harvested:',
        REC_TOTAL_BOSSES: 'Total bosses defeated:',
        REC_FILTER_MAP: 'Map:',
        REC_FILTER_DIFF: 'Difficulty:',
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
        LICENSES_THREE_TEXT: 'Copyright © 2010-2026 three.js authors. Free to use, modify, and distribute.',
        // UI build 2026-10-31: accessibility, HUD, profiler, error screen
        HUD_CONTROLS: 'Controls',
        HUD_RESOURCES: 'Resources',
        HUD_ABILITIES: 'Abilities of selected units',
        HUD_MINIMAP: 'Minimap: click to move the camera',
        BTN_HIDE: 'Hide',
        BTN_SHOW: 'Controls',
        SOUND_LABEL_ON: 'Sound: on',
        SOUND_LABEL_OFF: 'Sound: off',
        PAUSE_LABEL: 'Pause',
        RESUME_LABEL: 'Resume',
        FORMATION_GROUP: 'Squad formation',
        BTN_FPS_PANEL: 'FPS panel (`)',
        TOUCH_MODE_LABEL: 'Touch mode',
        ABILITY_ARIA: '{0}: {1}',
        ERR_TITLE: '🚨 Game code error',
        ERR_UNKNOWN: 'Unknown error',
        ERR_SOURCE: 'Where: {0}',
        DBG_TITLE: '🛠️ Profiler (F3)',
        DBG_CLOSE: 'Close profiler',
        DBG_SEC_RENDER: 'Render & frame',
        DBG_SEC_SUBSYSTEMS: 'Subsystems, ms per tick',
        DBG_SEC_COLLISIONS: 'Collision algorithm',
        DBG_SEC_INSTANCING: 'Instancing & simulation',
        DBG_SEC_BENCH: 'Stress test in narrow passages',
        DBG_SEC_ASSETS: 'Size & assets',
        DBG_FPS: 'FPS:',
        DBG_FRAME: 'Frame time:',
        DBG_TICK: 'JS tick (total):',
        DBG_DRAW_CALLS: 'Draw calls:',
        DBG_TRIANGLES: 'Triangles:',
        DBG_UNITS: 'Units (ours / enemy):',
        DBG_SELECTED: 'Selected:',
        DBG_FLOW: '🌊 Flow field (BFS):',
        DBG_SPATIAL: '⬡ Spatial hash & collisions:',
        DBG_FSM: '🤖 FSM & abilities:',
        DBG_AUDIO: '🔊 Web Audio synthesis:',
        DBG_VOICES_LABEL: '↳ voices:',
        DBG_VOICES: '{0} active / {1} events',
        DBG_RENDER: '🎨 Three.js render:',
        DBG_PAIRS: 'Pair checks per frame:',
        DBG_SIM_CORE: 'Simulation runs on:',
        DBG_SIM_MAIN: 'main thread',
        DBG_BENCH_STATUS: 'Test status:',
        DBG_BENCH_OFF: 'off',
        DBG_BENCH_ON: 'running ({0} units)',
        DBG_BENCH_RESET: '⏹️ Reset',
        DBG_CODE_SIZE: 'Game code (JS + CSS + HTML):',
        DBG_THREE_SIZE: 'Three.js:',
        DBG_EXTERNAL: 'External textures & sounds:',
        DBG_EXTERNAL_VAL: '0 files',
        DBG_NA: 'n/a (file://)',
        DBG_COLL_SPATIAL: '⬡ Spatial Grid O(N)',
        DBG_COLL_NAIVE: '⚠️ All-pairs O(N²)',
        DBG_COLL_SPATIAL_TIP: 'Hash grid: only neighbouring cells are checked',
        DBG_COLL_NAIVE_TIP: 'Every pair of units: expect a big FPS drop',
        DBG_INST_ON: '⚡ GPU instancing: on',
        DBG_INST_OFF: '🐌 Separate meshes: instancing off',
        DBG_INST_ON_TIP: 'Units and HP bars are drawn by shared InstancedMesh',
        DBG_INST_OFF_TIP: 'Every unit has its own mesh: many more draw calls',
        ALERT_COLL_NAIVE: '⚠️ Collisions: all-pairs O(N²). Expect an FPS drop.',
        ALERT_COLL_SPATIAL: '⬡ Collisions: hash grid O(N).',
        ALERT_INST_ON: '⚡ GPU instancing on: fewer draw calls.',
        ALERT_INST_OFF: '🐌 Separate meshes: more draw calls and load.',
        PERF_FPS: 'FPS',
        PERF_FRAME: 'Frame (avg / max)',
        PERF_UNITS: 'Units (ours / enemy)',
        PERF_THREADS: 'CPU Threads',
        DBG_THREADS: 'Simulation Threads (Web Workers):',
        UNITS_TOTAL: '{0} / {1} ({2} total)',
        STATS_TITLE: 'Battle summary',
        ABILITY_SHIELD_NAME: 'Shield',
        ABILITY_OVERDRIVE_NAME: 'Overdrive',
        ABILITY_SIEGE_NAME: 'Siege'
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

    // Обновляем доступные имена (aria-label) у элементов с data-i18n-aria
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        if (key) el.setAttribute('aria-label', t(key));
    });

    // Язык документа — для экранных дикторов и переносов
    if (document.documentElement) document.documentElement.lang = currentLanguage;

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
    // Подписи кнопок, которые зависят от состояния (скрыть/показать, пауза, тач-режим, профайлер)
    if (typeof refreshStatefulLabels === 'function') {
        refreshStatefulLabels();
    }
}
