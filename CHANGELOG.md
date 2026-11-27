# Changelog

Все заметные изменения Tabhold. Формат — по [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии — [SemVer](https://semver.org/lang/ru/). Идентификаторы `T-XX` — задачи из [`Todo.md`](Todo.md),
`BUG-0XX` — записи в [`bugs.md`](bugs.md).

## 0.4.0 — 2026-11-27

Изменения относительно `0.3.2` (коммит `19131ac`). Основание — план работ по аудиту 0.3.2 в `Todo.md`.

### Добавлено

- **Отступление и штурм-марш (T-07).** ПКМ — марш/отступление по полю потока без авто-агра
  (`attackMove: false`, `ignoreAggro: true`), `Alt+ПКМ` / `A+ЛКМ` — штурм-марш с янтарным маркером приказа,
  ПКМ по врагу или штабу — фокус-атака (`js/input.js`, `js/fsm.js`, `js/effects.js`).
- **Чистый модуль FSM (T-05).** `js/fsm.js` (`stepUnitFSM`, `recoverIdleEnemyPatrol`) без обращений к
  `THREE`, `document`, `window`; эффекты возвращаются через `ctx.events`. Юнит-тесты переходов
  IDLE / MOVE / CHASE / ATTACK — `tests/fsm.test.js`.
- **Замеры на реальном GPU (T-04).** [`docs/benchmarks.md`](docs/benchmarks.md): RTX 5050 Laptop, обычный матч
  на 256/512/1024 и стресс-тесты до 5000×5000, память после «Сбросить», две вкладки одновременно.
- **Playwright e2e в GitHub Actions (T-01)** — проекты `desktop` + `mobile` (Chromium).
- **Сводка тестов и артефакты в CI (T-18).** Бейдж статуса `Tests` в README; `scripts/ci-summary.js` пишет в
  Job Summary числа из json-отчётов Vitest и Playwright; артефакты `vitest-results` и `playwright-report`
  выгружаются при любом исходе, кроме отмены.
- **Профайлер показывает активную модель симуляции** (`#dbg-sim-model`, T-06).
- **Иконки PWA файлами** `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon.svg` вместо `data:` SVG;
  проверка установки через `Page.getInstallabilityErrors` в `e2e/smoke.e2e.js` (T-12).
- **Плейтест волн в настоящей игре (T-09).** `scripts/playtest_waves.js` (`npm run playtest`) и отчёт
  [`docs/playtest-T09.md`](docs/playtest-T09.md): на 1024 до базы доходят 75 % врагов, штаб пал на 3 картах из 4,
  как и на 256 («Офицер», сид 11, скрипт-игрок без захвата точек).

### Изменено

- **Баланс больших карт (T-09).** Лимит одновременных врагов `maxActiveEnemies` 50 / 75 / 110 и множитель
  походного марша волн и диверсантов `enemyMarchSpeedMult` 1.0 / 1.5 / 2.6 на 256 / 512 / 1024
  (`MAP_SIZE_CONFIGS` в `js/config.js`, `js/ai.js`).
- **Урон по штабу игрока (T-11)** зависит от типа врага и множителя сложности (`getEnemyHQDamage`, `js/ai.js`)
  вместо фиксированных 12 / 30.
- **Радиус захвата кристалла (T-10)** — `1.2 * CELL_SIZE`; кольцо и радиус патруля синхронизированы с логикой
  (`js/resources.js`).
- **Читаемость юнитов (T-08).** Процедурная карта окружения `scene.environment` (`js/scene.js`), осветлённые
  текстуры фракций, `metalness` 0.38 (`js/models.js`); стартовый зум `baseCamDist` 64 / 74 / 85 на
  256 / 512 / 1024 (`js/config.js`). Сравнение до/после — `docs/readability-before.png`, `docs/readability-after.png`.
- **Зум страницы разблокирован (T-13, WCAG 1.4.4).** Щипок по меню и панелям масштабирует страницу, щипок по
  полю — камеру (`#canvas-container`: `touch-action: none`); axe проверяет `meta-viewport` без исключений.
- **Стресс-тест назван честно (T-02).** Оговорка в README и в профайлере (RU/EN): стресс-тест считает упрощённую
  SoA-модель в пуле воркеров, его FPS — верхняя граница, а не измерение игры.
- **SoA-путь — только стенд бенчмарка (T-06).** Воркеры поднимаются по требованию (`ensureWorkers()`) и
  останавливаются после теста; код воркера — один источник `initSimWorkerScope` (`js/sim_worker.js`).
- **`scripts/headless_wave_test.js` (T-12)** грузит `js/config.js`, `js/maps.js`, `js/ai.js` вместо своей копии
  правил волн и сложности.
- **Документация сверена с кодом (T-03).** Каждое `[x]` в `ROADMAP.md` и числа в `AGENTS.md` — со ссылкой на
  `файл:строка` или замер.
- **CI e2e:** лимит job 30 → 45 мин, `globalTimeout` Playwright 40 мин в CI (T-18).
- **Service Worker:** кэш `tabhold-v0.4.0` — у установленного PWA обновятся `index.html`, `style.css` и скрипты.

### Удалено

- `SimulationWorld` и его хуки в `js/units.js`, `main.js`, `js/input.js`, `js/ui.js`: обычный матч больше не
  держит дублирующее SoA-состояние (T-06).
- Дублирующая строка-копия кода воркера `SIM_WORKER_CODE` — теперь собирается из `js/sim_worker.js` (T-06).

### Тесты

- Vitest: 191 → 230 тестов. Playwright `desktop` + `mobile`: 36 → 39 тестов.

### Известные ограничения

- Firefox и настоящий Safari не проверялись: CI гоняет только Chromium (T-14).
- Нет типизации (T-15), inline-обработчики в `index.html` мешают CSP (T-16), ошибки не отправляются наружу
  (T-17), один игровой режим — бесконечные волны (T-19).

## 0.3.2 и ранее

Исправления аудита 0.3.1–0.3.2 (BUG-002…BUG-034) — в [`bugs.md`](bugs.md); история — `git log`.
