# Компоненты Minimal Web RTS: спецификация

Основа: код коммита `36e225f`, скриншоты Playwright 1280×800 и 390×844 (Chromium + SwiftShader), вычисленные стили
`getComputedStyle`. Токены: `design/tokens.css` (генерирует `design/build_tokens.py`). Ссылки `файл:строка` даны для `36e225f`.

**Формат блока:** варианты · размеры · состояния · токены · a11y · где используется · что сейчас не так (замер).
Компоненты описывают **целевое** состояние. Пункты «сейчас» говорят, что нужно поменять в `style.css`/`index.html`,
чтобы прийти к спецификации.

> **Состояние на 2026-10-31:** пункты «сейчас» закрыты сборкой интерфейса (`build-log.md`), кроме `meta-viewport`
> (оставлен намеренно) и цветов 3D-сцены (`js/palette.js` не делался).

## Сквозные правила (для всех компонентов)

| правило | значение | почему |
|---|---|---|
| Цвет | только `var(--color-…)`, без hex в компонентах | сейчас в `style.css` 22 разных hex и ~50 разных rgba; в `ui.js` и `index.html` ещё ~20 inline-цветов |
| Шрифт | `button, select, input { font: inherit }` (уже в `tokens.css`) | замер: кнопки и селекты рисуются **Arial**, остальной текст `sans-serif` |
| Фокус | `:focus-visible` → 2px `--color-focus`, отступ 2px (уже в `tokens.css`) | в `style.css` стиль фокуса есть только у селектов (`style.css:948-955`), у кнопок нет |
| Минимальный кегль | 11px (`--text-2xs`) | сейчас встречаются 9px и 10px (`.ability-status` 10px; 9px на мобильном, `style.css:572`) |
| Размер цели | ≥ 24×24 везде (WCAG 2.2 SC 2.5.8, AA); ≥ 44px высотой в `(pointer: coarse)` (SC 2.5.5, AAA) | замер на 390×844: «Скрыть», «Звук», «Пауза» по **24px** (ровно на минимуме AA), производство 34px, способности 31px |
| Движение | `--motion-base` 200ms для hover/press; пульсации 1.2s; всё гасится `prefers-reduced-motion` (уже в `tokens.css`) | в `style.css` `prefers-reduced-motion` не учитывается |
| Иконки | эмодзи (⚡🛡️⚓🏆…) **оставить**: это системный шрифт, а не ассеты. Им нужен текстовый эквивалент (видимая подпись или `aria-label`); эмодзи рядом с текстом пометить `aria-hidden="true"` | правило Zero Assets (`AGENTS.md §2.5`); эмодзи выглядят по-разному в разных ОС, это ожидаемо |
| ARIA | в `index.html` сейчас **0** атрибутов `aria-*` и `role` (grep) | см. a11y каждого компонента |

---

## Button

```
Button
  variants  primary   — главное действие экрана («▶ Играть», «Играть снова», «Сохранить и закрыть»)
            action    — обычная кнопка (меню, производство, строй, HUD)
            ghost     — прозрачная с неоновой обводкой («Пауза», «🖐 Карта», ссылка на GitHub)
            danger    — разрушительное/стресс-действие (только профайлер: «1500 🔥», «Стоп»)
  sizes     xs 24px  — шапка панели HUD (Скрыть / Звук / Пауза); в coarse → 44px
            sm 32px  — производство, строй, кнопки модалок; в coarse → 44px
            md 44px  — кнопки главного меню (замер 45px)
            lg 48px  — primary в меню и на S05 (замер 48px)
  states    default · hover (bg accent, text on-accent, glow-accent — так сейчас у всех кнопок, style.css:82-86)
            · active (translateY 0, без glow) · focus-visible (кольцо 2px focus, offset 2px)
            · disabled (opacity .4, cursor not-allowed, без hover; WCAG не требует контраста для неактивных)
            · loading — не нужен (нет сетевых действий)
  tokens    primary: bg action-primary, text on-action-primary, border accent 1px, glow-action
            action:  bg action, text on-action, border action-border 1px
            ghost:   bg surface, text accent, border accent 1px
            danger:  bg rgba danger .16, text danger, border danger
            общее:   radius sm, font sm/700 (lg/700 у primary), motion base;
            padding xs/sm space-3/space-5 (6/12px), md/lg space-5/space-8 (12/24px)
  a11y      настоящий <button type="button">; кнопка только с иконкой (⏸️ на мобильном) — aria-label
            из i18n («Пауза (P / Esc)»), сейчас только title (index.html, #hud-pause-btn);
            горячая клавиша — в aria-keyshortcuts (P, Escape); disabled — атрибутом, а не классом
  used on   S01 (меню), S02 (HUD, производство, строй), S05, все модалки, S03
  сейчас    • белый текст на #0077ff = 4.13:1 → токен action #006be6 = 4.95:1
            • белый текст на #00a2ff («Играть») = 2.76:1 (провал даже для крупного текста)
              → текст on-action-primary #04101f = 6.93:1. Кнопка остаётся яркой, текст становится тёмным.
              Альтернатива, если нужен белый текст: фон #0079bf (4.68:1), но тогда primary темнее action
            • стиль disabled есть только у #produce-btn, #scout-btn, #tank-btn (style.css:143-156) → перенести в базовый
```

## Toggle button (переключатель)

```
Toggle
  variants  segment — группа «один из» (строй: Шеренга / Клин / Кольцо)
            switch  — вкл/выкл (Звук, режим тача «Карта / Рамка», Инстансинг, Алгоритм коллизий в F3)
  sizes     как Button sm (coarse → 44px)
  states    off = Button action · on = bg accent, text on-accent, glow-accent (как активный строй на S02)
            + hover / focus-visible / disabled как у Button
  tokens    те же, что у Button; on — accent / on-accent
  a11y      segment: обёртка role="radiogroup" + aria-label «Построение»; кнопки role="radio" + aria-checked
            switch: <button aria-pressed="true|false">; подпись меняется вместе с состоянием («Звук: ВКЛ»)
  used on   S02 (#instructions-content), S03
  сейчас    состояние видно только цветом; aria-pressed / aria-checked нет
```

## Ability button (способность)

```
AbilityButton
  variants  shield (Дрон, E) · overdrive (Разведчик, Q) · siege (Танк, R/F)
  sizes     40px desktop (замер), coarse → 44px; ширина по контенту, min 96px
  layout    иконка (эмодзи, aria-hidden) · имя (sm/700) · клавиша (2xs mono, accent) · статус (2xs/600)
  states    ready     — статус «ГОТОВО», цвет info; рамка border-strong
            active    — bg accent 30%, рамка accent, glow-accent-strong, статус accent + таймер «ЩИТ (3.2с)»
            cooldown  — рамка warning 50%, пульс 1.2s, статус warning + «4.1с»
            hidden    — нет выделенных юнитов нужного класса (панель скрыта)
            + hover (translateY -2px, glow) / focus-visible / pressed
  tokens    bg surface-control, text text, key accent, status info|accent|warning, radius md, dock: surface-dock
  a11y      <button aria-keyshortcuts="E">; aria-label собирает имя + статус («Щит, готово» / «Щит, перезарядка 4 секунды»);
            смену статуса не озвучивать каждый тик — только переходы ready↔active↔cooldown через общий live-регион (см. Alert)
  used on   S02 (#ability-panel)
  сейчас    • статус 10px (9px на мобильном) → 2xs 11px
            • статусы раньше были зашиты по-русски; на 36e225f переведены через i18n (проверено grep)
```

## Panel (стеклянная панель HUD)

```
Panel
  variants  hud   — инструкции, ресурсы, волна, миникарта, тач-режим (surface)
            dock  — панель способностей (surface-dock)
            dev   — профайлер F3, FPS-панель (surface-dev)
            card  — карточка внутри модалки: статистика S05, шаг обучения (surface-inset)
  states    visible · hidden · collapsed (у инструкций: только шапка с кнопками)
  tokens    bg glass-роль, border 1px border, radius lg (card: xl), shadow panel, padding space-5/space-6 (12/16px),
            backdrop-filter blur glass
  layout    отступ от края экрана hud-inset 10px; панели не должны перекрываться (см. «сейчас»)
  a11y      каждая значимая панель — <section aria-label="…"> (Ресурсы, Волна, Миникарта)
  used on   S02, S03, S04, S05
  сейчас    перекрытия по замеру bounding box (390×844, 36e225f):
            • #instructions × #resource-panel: 104×44px (закрыта кнопка «Звук»)
            • #resource-panel × #wave-panel: 90×25px
            • на 1280×800 FPS-панель (`) ложится на кнопку «🖐 Карта» (скриншот S03_S04_debug_d)
            → правило раскладки HUD: верхний ряд «инструкции | волна | ресурсы» с flex/grid и gap space-3,
              на compact инструкции уходят в иконку-кнопку; dev-панели не занимают нижний левый угол
```

## Modal (диалог)

```
Modal
  variants  settings · records · tutorial (шире, сетка шагов) · licenses (прокрутка текста)
            + полноэкранные оверлеи на той же основе: pause, game-over (S05), main menu (S01)
  sizes     width modal-width 480px (tutorial — до 640px), max-height 90vh с прокруткой тела;
            compact: на всю ширину минус space-4
  states    closed · open · (records) фильтр карта×сложность меняет содержимое без закрытия
  tokens    backdrop scrim + blur glass; card surface-raised, border border-strong, radius xl, shadow modal,
            padding space-8/space-9 (24/32px); заголовок xl/700 accent, letter-spacing 1px
  a11y      role="dialog" aria-modal="true" aria-labelledby=<id заголовка>;
            при открытии фокус на первый элемент, Tab заперт внутри, Esc закрывает, фокус возвращается
            на кнопку, открывшую окно; игра на паузе, пока окно открыто
  used on   S01 → settings/records/tutorial/licenses; S02 → pause → settings; S05
  сейчас    • ролей и aria нет (0 в index.html)
            • Esc глобально переключает паузу (input.js:487), обработчика закрытия модалок по Esc я не нашёл
            • вызовов .focus() в ui.js/input.js нет (grep) → фокус остаётся под окном
            • z-index: модалки и pause = 120 (style.css:852 и pause-overlay) — один слой, порядок
              решает DOM; ввести --z-modal выше --z-menu (уже в токенах: menu 110, modal 120)
```

## Select (выпадающий список)

```
Select
  variants  menu (S01: карта, сложность) · settings · filter (records: карта × сложность)
  sizes     36px (замер 35), coarse 44px
  states    default · hover (border accent) · focus-visible (border accent + кольцо focus) · disabled
  tokens    bg surface-sunken, text text, border 1px border-strong (итог border-input 3.25:1 / 3.14:1 — проходит 3:1),
            radius md, font sm, padding space-4/space-5
  a11y      нативный <select> + видимый <label for>; в records — подпись у обоих фильтров
  used on   S01, settings, records
  сейчас    ок по контрасту; у селектов outline:none с собственной заменой (style.css:948) — заменить на общий :focus-visible
```

## Slider (громкость)

```
Slider
  variants  volume (Master / SFX / Music)
  sizes     трек 6px, бегунок 16px; строка ≥ 32px (coarse 44px)
  states    default · hover · focus-visible · dragging; значение справа «100%» (mono sm, accent)
  tokens    трек заполнения accent, остаток border-strong, бегунок accent, glow-accent
  a11y      <input type="range" min=0 max=100 step=5> с <label>; aria-valuetext="80 процентов";
            стрелки ←/→ меняют на 5; значение справа связать aria-describedby или убрать дубль
  used on   settings
```

## Tactical alert (тактическое оповещение)

```
Alert
  variants  info (рамка и текст accent, glow-accent) · danger (рамка и текст danger, bg surface-danger, glow-danger)
  timing    появление сразу, держится motion-alert-hold 4.5s, затухание motion-slow 0.4s (ui.js:229-232)
  states    hidden · shown · fading; новое сообщение заменяет текущее и перезапускает таймер
  tokens    radius lg, padding space-4/space-7, font md/700, z alert
  a11y      один постоянный контейнер: info — role="status" (aria-live="polite"), danger — role="alert";
            текст менять, контейнер не пересоздавать; звук оповещения уже есть (playAlertSound)
  used on   S02
  сейчас    • цвета заданы inline в ui.js:224-226 (#ff3333, #ff4444, #00ffcc, rgba) → классы .is-info / .is-danger
            • на 390×844 ложится на панель волны (скриншот S02_ability_alert_m)
```

## Stat row (строка статистики)

```
StatRow
  variants  neutral (значение text) · positive (accent / success) · negative (danger) · energy (accent + «⚡»)
  layout    метка слева (text-muted), значение справа (bold), разделитель 1px border снизу, кроме последней
  font      S05 — mono md; records — sans md; профайлер — mono 2xs/xs
  a11y      таблица смысла: <dl><dt>метка</dt><dd>значение</dd></dl>; эмодзи в метке aria-hidden
  used on   S03, S04, S05, records
```

## Tutorial step (шаг обучения)

```
TutorialStep
  layout    иконка (эмодзи, aria-hidden) · заголовок md/700 accent · описание xs/400 text-secondary, line 1.45
  tokens    Panel card: surface-inset, border, radius lg, padding space-5/space-6
  a11y      список <ol>; шаги 1-3 — порядок важен
  used on   tutorial
```

## Minimap

```
Minimap
  size      170×170 canvas + padding 4 (замер wrap 180×180), compact 133×133
  states    default · hover (курсор pointer) · drag/tap (перенос камеры)
  tokens    wrap: Panel hud, radius md, border 1px border-strong
  colors    союзники accent, враги danger, кристаллы warning, стены — оттенок accent (см. «3D-цвета»)
  a11y      canvas с aria-label «Миникарта: нажмите, чтобы перенести камеру»; дополнительный элемент, клавиатурный
            аналог — WASD (уже есть)
  used on   S02
```

## Selection box (рамка выделения)

```
SelectionBox
  style     border 2px dashed accent, bg accent 15%, glow-accent; pointer-events none; z selection
  used on   S02 (мышь; тач в режиме «Рамка»)
```

## Profiler (HUD-профайлер F3) и FPS-панель — инструмент разработчика

```
Profiler
  layout    Panel dev; секции с заголовком 2xs/700 uppercase text-muted; строки StatRow mono xs
  states    hidden · open · benchmark running
  tokens    surface-dev, text-muted (заголовки), info (значения), accent (хорошо), warning (наивный режим), danger (FPS низкий)
  a11y      не обязателен для игрока; закрывающая кнопка ✕ — aria-label «Закрыть профайлер»
  сейчас    • заголовки секций #64748b на фоне профайлера = 3.86:1 (провал AA) → text-muted 7.16:1
            • устаревшие статичные цифры в index.html:202, 229-232:
              «Вес кода игры ~235 KB» — замер du -b: index.html+style.css+main.js+js/*.js = 427 057 байт;
              «Three.js ~648 KB» — libs/three.min.js = 766 992 байт;
              «GPU Instancing: ВКЛ (~16 calls)» — счётчик Draw Calls рядом в той же панели показывал 77 (скриншот S03)
            • «Ядро симуляции: Web Worker (Multi-thread)» показывается, если воркер создан
              (ui.js:548-551), хотя симуляция идёт в главном потоке (recon §2, architecture §1)
            → цифры считать при сборке или убрать; подпись «Main thread (воркер — прототип)»
```

## 3D-цвета (сцена; не DOM, но та же система ролей)

| роль | значение в коде | где |
|---|---|---|
| ally / успех / выделение | `0x00ffcc` = `--color-accent` | `healthbar.js:19`, `effects.js:35, 54, 127` |
| enemy / урон | `0xff3333` (≈ `--color-danger` #ff4444) | `healthbar.js:20`, `effects.js:36, 58, 142` |
| щит | `0x00d4ff` (≈ `--color-info`) | `healthbar.js:21` |
| кристаллы / нейтральное | `0xffaa00` = `--color-warning` | `resources.js:43, 51, 63, 83` |
| подложка HP-бара | `0x4a0e0e` | `healthbar.js:18` |

Three.js принимает числа, а не CSS-переменные. Предложение для `/replica-build`: модуль `js/palette.js` с теми же
ролями (`PALETTE.accent = 0x00ffcc` …), который `build_tokens.py` генерирует вместе с `tokens.css`. Тогда ребренд
меняет DOM и сцену из одного места.

---

## Что сознательно не трогаем

- **Неоновая айдентика** (accent `#00ffcc` на тёмном стекле) — это твой собственный стиль, не чужой. Роль `accent`
  записана, значение можно сменить в `/replica-brand`, если захочешь.
- **Шрифтовые файлы** не добавляются: системные стеки (`--font-sans`, `--font-mono`) соблюдают Zero Assets.
- **Тексты интерфейса** не переписывались: это работа i18n и `/replica-brand` (голос бренда).
