#!/usr/bin/env python3
"""Генератор дизайн-токенов Tabhold. Только стандартная библиотека.

Один источник правды -> design/tokens.json (для contrast.py) и design/tokens.css.

    python3 design/build_tokens.py           # записать токены + проверить контраст
    python3 design/build_tokens.py --check   # только проверка (код выхода 1 при провале AA)

Почему генератор, а не руками: почти все панели HUD полупрозрачные (стекло поверх
3D-сцены). Контраст текста зависит от того, что под стеклом. Скрипт смешивает
каждый rgba-слой с худшим измеренным фоном сцены и пишет в tokens.json уже
итоговый hex — его и проверяет contrast.py.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# 1. Фон сцены под HUD (замер, не догадка)
# ---------------------------------------------------------------------------
# Скриншот S02 (1280x800, коммит 36e225f), область сцены x 780-1030, y 130-640:
# медиана пикселей #162840 (пол), 90-й перцентиль #00a180 (верх стен).
# Худший реалистичный случай для светлого текста = стена.
SCENE_WORST = "#00a180"
SCENE_FLOOR = "#162840"


def _rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def _hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c))) for c in rgb)


def over(rgba, under_hex):
    """Альфа-смешивание: слой rgba(r,g,b,a) поверх непрозрачного цвета."""
    r, g, b, a = rgba
    u = _rgb(under_hex)
    return _hex([a * c + (1 - a) * d for c, d in zip((r, g, b), u)])


def css_rgba(rgba):
    r, g, b, a = rgba
    return "rgba(%d, %d, %d, %s)" % (r, g, b, ("%g" % a))


# ---------------------------------------------------------------------------
# 2. Стеклянные слои (значения из style.css @ 36e225f)
# ---------------------------------------------------------------------------
GLASS = {
    # роль               rgba                      где в style.css
    "surface":          (11, 13, 25, 0.90),     # #instructions, #resource-panel, #wave-panel, #minimap-wrap
    "surface-dock":     (10, 15, 28, 0.92),     # #ability-panel
    "surface-control":  (22, 30, 52, 0.85),     # .ability-btn (поверх dock)
    "scrim":            (4, 7, 15, 0.88),       # .modal-backdrop, #pause-overlay (game-over 5,6,12,.88)
    "scrim-strong":     (5, 6, 12, 0.92),       # #main-menu-overlay
    "surface-raised":   (10, 15, 28, 0.96),     # .modal-card (поверх scrim)
    "surface-inset":    (15, 23, 42, 0.65),     # .tutorial-step (поверх raised)
    "surface-danger":   (22, 10, 18, 0.94),     # #tactical-alert (опасность)
    "surface-dev":      (8, 13, 24, 0.94),      # #debug-overlay
}

eff = {}
eff["surface"] = over(GLASS["surface"], SCENE_WORST)
eff["surface-dock"] = over(GLASS["surface-dock"], SCENE_WORST)
eff["surface-control"] = over(GLASS["surface-control"], eff["surface-dock"])
eff["scrim"] = over(GLASS["scrim"], SCENE_WORST)
eff["scrim-strong"] = over(GLASS["scrim-strong"], SCENE_WORST)
eff["surface-raised"] = over(GLASS["surface-raised"], eff["scrim"])
eff["surface-inset"] = over(GLASS["surface-inset"], eff["surface-raised"])
eff["surface-danger"] = over(GLASS["surface-danger"], SCENE_WORST)
eff["surface-dev"] = over(GLASS["surface-dev"], SCENE_WORST)

BORDER = {
    "border":        (0, 255, 204, 0.20),   # обводка панелей HUD
    "border-strong": (0, 255, 204, 0.40),   # обводка модалок, полей ввода
}
# Полупрозрачные подсветки состояний (не фон для текста, поэтому в контраст не идут)
TINT = {
    "accent-tint":  (0, 255, 204, 0.15),    # #selection-box
    "info-tint":    (0, 212, 255, 0.30),    # .ability-btn.active
    "danger-tint":  (255, 68, 68, 0.16),    # кнопки профайлера «1500 🔥» / «Стоп»
    "warning-edge": (255, 170, 0, 0.50),    # .ability-btn.cooldown рамка
}
SURFACE_SUNKEN = "#0d1322"                   # .menu-select, .settings-select (непрозрачный)
eff["border-input"] = over(BORDER["border-strong"], SURFACE_SUNKEN)

# ---------------------------------------------------------------------------
# 3. Роли цветов. Комментарий = что было в коде -> почему так
# ---------------------------------------------------------------------------
SOLID = {
    "bg":               "#0b0d19",  # body; фон за сценой
    "surface-sunken":   SURFACE_SUNKEN,
    "text":             "#ffffff",  # основной текст HUD
    "text-body":        "#e2e8f0",  # текст в модалках
    "text-secondary":   "#cbd5e1",  # описания шагов обучения
    "text-muted":       "#94a3b8",  # подписи; сюда же слиты #9db4d8 и #64748b (последний давал 3.67:1)
    "accent":           "#00ffcc",  # неон: заголовки, значения, обводки, фокус (30 раз в style.css)
    "on-accent":        "#000000",  # текст на неоне (активный строй, hover)
    "action":           "#006be6",  # БЫЛО #0077ff: белый текст давал 4.13:1 < 4.5. Тот же тон, темнее
    "action-border":    "#00a2ff",
    "on-action":        "#ffffff",
    "action-primary":   "#00a2ff",  # «Играть», .primary-btn
    "on-action-primary": "#04101f",  # БЫЛО #ffffff: 2.76:1, провал даже для крупного текста
    "info":             "#38bdf8",  # статус способности «ГОТОВО»
    "success":          "#00ffcc",  # победа, рост, захват = accent
    "warning":          "#ffaa00",  # кулдаун, точки сбора; слиты #fbbf24 #f59e0b #ff9900
    "danger":           "#ff4444",  # поражение, тревога; слиты #ef4444 #ff3333 #ff3366 #f87171
    "focus":            "#00ffcc",  # кольцо фокуса = accent
}

COLOR = dict(SOLID)
COLOR.update({k: eff[k] for k in (
    "surface", "surface-dock", "surface-control", "scrim", "scrim-strong",
    "surface-raised", "surface-inset", "surface-danger", "surface-dev", "border-input")})

# Каждая пара «текст на фоне», которая реально есть в интерфейсе.
# "large" = >= 24px обычный или >= 18.66px bold (WCAG 1.4.3), "ui" = рамки/фокус (1.4.11).
PAIRS = [
    ["text", "surface"], ["text", "surface-dock"], ["text", "surface-control"],
    ["text", "surface-sunken"], ["text", "surface-dev"],
    ["text-body", "surface-raised"], ["text-secondary", "surface-inset"],
    ["text-muted", "surface"], ["text-muted", "surface-raised"], ["text-muted", "surface-dev"],
    ["text-muted", "scrim-strong"],
    ["accent", "surface"], ["accent", "surface-raised"], ["accent", "surface-control"],
    ["accent", "surface-dev"], ["accent", "scrim-strong"], ["accent", "scrim"],
    ["on-accent", "accent"],
    ["on-action", "action"], ["on-action-primary", "action-primary"],
    ["info", "surface-control"], ["warning", "surface"], ["warning", "surface-control"],
    ["danger", "surface"], ["danger", "surface-raised"], ["danger", "surface-danger"],
    ["danger", "surface-dev"], ["success", "scrim"],
    ["border-input", "surface-raised", "ui"], ["border-input", "surface-sunken", "ui"],
    ["focus", "surface", "ui"], ["focus", "surface-raised", "ui"], ["focus", "scrim-strong", "ui"],
]

# ---------------------------------------------------------------------------
# 4. Остальная система (замеры style.css, приведены к шкале)
# ---------------------------------------------------------------------------
FONT = {
    # было: body sans-serif, кнопки/селекты Arial (не наследуют шрифт), моно Consolas.
    # Файлов шрифтов нет и не будет (правило Zero Assets): только системные стеки.
    "sans": "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    "mono": "ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', Menlo, 'Courier New', monospace",
}
# было 16 размеров: 9 10 11 12 13 13.33 14 15 16 18 20 24 26 28 38 42
TYPE = {
    "2xs":     {"size": 11, "line": 14, "weight": 600},  # клавиши, статусы (было 9-10 -> минимум 11)
    "xs":      {"size": 12, "line": 16, "weight": 400},  # подписи полей, бейджи
    "sm":      {"size": 13, "line": 18, "weight": 400},  # кнопки HUD, селекты (13 и 13.33)
    "md":      {"size": 14, "line": 20, "weight": 400},  # текст HUD, строки статистики (14-15)
    "base":    {"size": 16, "line": 24, "weight": 400},  # инструкции, кнопки меню
    "lg":      {"size": 18, "line": 24, "weight": 700},  # главная кнопка (18-20)
    "xl":      {"size": 24, "line": 30, "weight": 700},  # заголовок модалки (24-28)
    "display": {"size": 40, "line": 44, "weight": 700},  # заголовок меню / ПОБЕДА (38-42)
}
# было: 2 3 4 5 6 7 8 9 10 12 14 15 16 18 20 22 24 26 28 -> шаг 2/4
SPACE = [0, 2, 4, 6, 8, 12, 16, 20, 24, 32]
RADIUS = {"sm": 4, "md": 6, "lg": 8, "xl": 12}          # было 2 4 5 6 8 10 12
SHADOW = {
    "panel":         "0 4px 25px rgba(0, 0, 0, 0.7)",
    "modal":         "0 10px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 255, 204, 0.2)",
    "glow-accent":   "0 0 10px rgba(0, 255, 204, 0.5)",
    "glow-accent-strong": "0 0 18px rgba(0, 255, 204, 0.7)",
    "glow-action":   "0 0 15px rgba(0, 162, 255, 0.4)",
    "glow-warning":  "0 0 14px rgba(255, 170, 0, 0.5)",
    "glow-danger":   "0 0 30px rgba(255, 68, 68, 0.6)",
}
BLUR = {"glass": "12px"}                                  # было 10 / 12 / 14
MOTION = {
    "base": "200ms", "slow": "400ms", "ease": "ease",     # было: all 0.2s ease (x7), opacity 0.4s
    "pulse": "1200ms",                                    # abilityPulse, alert-pulse
    "alert-hold": "4500ms",                               # ui.js showTacticalAlert
}
Z = {"scene": 1, "selection": 5, "hud": 10, "alert": 15, "dock": 25, "dev": 50,
     "game-over": 100, "menu": 110, "modal": 120}         # как в style.css
LAYOUT = {
    "hud-inset": "10px",            # отступ панелей от края экрана
    "menu-width": "380px",          # колонка кнопок меню
    "modal-width": "480px",
    "target-min": "24px",           # WCAG 2.2 SC 2.5.8 (AA)
    "target-touch": "44px",         # WCAG 2.5.5 (AAA); цель для (pointer: coarse)
    # размеры компонентов (замер style.css @ 36e225f, приведено к шкале)
    "control-sm": "32px",           # кнопка по умолчанию
    "control-md": "36px",           # select
    "control-ability": "40px",      # кнопка способности
    "ability-min-w": "112px",
    "ability-min-w-compact": "96px",
    "instructions-max-w": "560px",
    "resource-w": "230px",
    "dev-panel-w": "290px",
    "minimap-size": "170px",
    "minimap-size-compact": "133px",
    "stats-min-w": "320px",
    "menu-config-w": "440px",
    "tutorial-width": "640px",
    "error-width": "640px",
    "pre-max-h": "200px",
    "dev-panel-min-h": "200px",
    "hud-top-reserve": "220px",     # место под верхний ряд HUD для прокрутки инструкций
    "hud-reserve": "460px",         # верх + низ HUD: высота профайлера = 100vh - это
    "tracking": "0.5px",            # статусы, заголовок профайлера
    "tracking-wide": "0.6px",       # подписи секций (uppercase)
    "tracking-title": "1px",        # заголовки модалок
    "lift": "-2px",                 # подъём кнопки способности при наведении
    "bp-compact": "(max-width: 768px), (pointer: coarse)",  # как в style.css:480
    "bp-coarse": "(pointer: coarse)",
}


def build():
    tokens = {
        "_about": ("Токены Tabhold. Сгенерировано design/build_tokens.py — правьте там. "
                   "Цвета surface-* и border-input здесь — ИТОГОВЫЙ цвет стекла поверх худшего фона сцены "
                   "(" + SCENE_WORST + "), для проверки контраста. В CSS стекло остаётся rgba (см. glass)."),
        "_measured": {"commit": "36e225f", "scene_worst": SCENE_WORST, "scene_floor": SCENE_FLOOR},
        "color": COLOR,
        "glass": {k: css_rgba(v) for k, v in GLASS.items()},
        "border": {k: css_rgba(v) for k, v in BORDER.items()},
        "tint": {k: css_rgba(v) for k, v in TINT.items()},
        "pairs": PAIRS,
        "font": FONT, "type": TYPE, "space": SPACE, "radius": RADIUS, "shadow": SHADOW,
        "blur": BLUR, "motion": MOTION, "z": Z, "layout": LAYOUT,
    }
    with open(os.path.join(HERE, "tokens.json"), "w", encoding="utf-8") as fh:
        json.dump(tokens, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    L = ["/* =============================================================================",
         "   design/tokens.css — дизайн-токены Tabhold",
         "   СГЕНЕРИРОВАНО design/build_tokens.py, руками не править.",
         "   Подключать ПЕРВЫМ, до style.css. Компоненты используют только var(--…).",
         "   ============================================================================= */",
         ":root {", "    color-scheme: dark;", "", "    /* Цвета: сплошные роли */"]
    for k, v in SOLID.items():
        L.append("    --color-%s: %s;" % (k, v))
    L += ["", "    /* Стекло: реальные rgba (контраст проверен по итоговому цвету, см. tokens.json) */"]
    for k, v in GLASS.items():
        L.append("    --color-%s: %s;" % (k, css_rgba(v)))
    for k, v in BORDER.items():
        L.append("    --color-%s: %s;" % (k, css_rgba(v)))
    for k, v in TINT.items():
        L.append("    --color-%s: %s;" % (k, css_rgba(v)))
    L += ["", "    /* Шрифт */"]
    for k, v in FONT.items():
        L.append("    --font-%s: %s;" % (k, v))
    for k, v in TYPE.items():
        L.append("    --text-%s: %dpx;  --leading-%s: %dpx;  --weight-%s: %d;" % (
            k, v["size"], k, v["line"], k, v["weight"]))
    L += ["", "    /* Отступы: --space-N = N-й шаг шкалы */"]
    for i, v in enumerate(SPACE):
        L.append("    --space-%d: %dpx;" % (i, v))
    L += [""] + ["    --radius-%s: %dpx;" % (k, v) for k, v in RADIUS.items()]
    L += [""] + ["    --shadow-%s: %s;" % (k, v) for k, v in SHADOW.items()]
    L += [""] + ["    --blur-%s: %s;" % (k, v) for k, v in BLUR.items()]
    L += [""] + ["    --motion-%s: %s;" % (k, v) for k, v in MOTION.items()]
    L += [""] + ["    --z-%s: %d;" % (k, v) for k, v in Z.items()]
    L += [""] + ["    --%s: %s;" % (k, v) for k, v in LAYOUT.items() if not k.startswith("bp-")]
    L += ["}", "",
          "/* Брейкпоинты нельзя хранить в custom properties — используйте эти media-запросы:",
          "   compact: @media %s" % LAYOUT["bp-compact"],
          "   coarse:  @media %s */" % LAYOUT["bp-coarse"], "",
          "/* Базовые правила системы (не компоненты) */",
          "button, select, input { font: inherit; }   /* было: кнопки и селекты рисовались Arial */",
          ":focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }",
          "",
          "@media (prefers-reduced-motion: reduce) {",
          "    *, *::before, *::after {",
          "        animation-duration: 1ms !important;",
          "        animation-iteration-count: 1 !important;",
          "        transition-duration: 1ms !important;",
          "    }",
          "}", ""]
    with open(os.path.join(HERE, "tokens.css"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))

    glass_eff = {k: COLOR[k] for k in GLASS}
    with open(os.path.join(HERE, "tokens.effective.js"), "w", encoding="utf-8") as fh:
        fh.write("// СГЕНЕРИРОВАНО design/build_tokens.py. Итоговые цвета стекла поверх %s (для стенда design/index.html).\n" % SCENE_WORST)
        fh.write("window.DS_EFFECTIVE = %s;\n" % json.dumps(glass_eff, indent=2))

    print("tokens.json + tokens.css + tokens.effective.js записаны. Итоговые цвета стекла поверх %s:" % SCENE_WORST)
    for k in ("surface", "surface-dock", "surface-control", "scrim", "scrim-strong",
              "surface-raised", "surface-inset", "surface-danger", "surface-dev", "border-input"):
        print("  %-16s %s" % (k, COLOR[k]))


# ---------------------------------------------------------------------------
# 5. Проверка контраста (WCAG 2.x: относительная яркость и отношение (L1+0.05)/(L2+0.05))
# ---------------------------------------------------------------------------
NEEDS = {"normal": 4.5, "large": 3.0, "ui": 3.0}   # SC 1.4.3 (текст), SC 1.4.11 (элементы UI)


def _lum(h):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in _rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    a, b = _lum(fg), _lum(bg)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def check():
    fails = 0
    for p in PAIRS:
        size = p[2] if len(p) > 2 else "normal"
        r = contrast(COLOR[p[0]], COLOR[p[1]])
        ok = r >= NEEDS[size]
        fails += not ok
        print("  %-4s %6.2f:1  %-18s on %-16s %s" % ("ok" if ok else "FAIL", r, p[0], p[1],
                                                    "" if size == "normal" else size))
    print("  %d пар, провалов AA: %d" % (len(PAIRS), fails))
    return 1 if fails else 0


if __name__ == "__main__":
    if "--check" not in sys.argv:
        build()
    sys.exit(check())
