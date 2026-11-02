# Что исправлять и как позиционировать: Minimal Web RTS

Дата: 2026-11-02. Основа: `replica/reviews.csv` (101 отзыв и комментарий), `replica/feedback.md` (авторазбор `reviews.py` по темам `replica/themes-rts.json`), ручная разметка `replica/coding.json`.

## С чего это собрано и где слабые места

Оригинал — твоя же версия игры, отзывов на неё нет. Поэтому здесь отзывы на **похожие игры и на жанр**: браузерные RTS, мобильные RTS и survival-RTS с волнами.

| источник | что | строк |
|---|---|---|
| Hacker News (через зеркала) | Show HN: Battle of Flags (~2022), Artillery/Project Atlas (2013), Shards of Stone (2026) | 43 |
| Reddit r/RealTimeStrategy (через снимок reddit.sentinel-team.org от 2026-01-16) | 5 тредов про одиночную игру, мобильные RTS, кампании | 23 |
| Steam Discussions | They Are Billions, 2 треда (2018, 2024) | 19 |
| App Store (AU, NZ, JP) | Mindustry | 12 |
| Google Play (через grand-screen.com) | Rusted Warfare | 3 |
| itch.io | Primordial (WebGL RTS) | 1 |

Ограничения, которые надо держать в голове:
- **Звёзд нет ни у одной строки** (форумы и страницы без оценок), поэтому вес у всех одинаковый (0.6 в `reviews.py`).
- **Тексты — дословные отрывки до 125 символов.** Обрезка отмечена «…». Так их отдаёт инструмент чтения страниц, полный текст по ссылке.
- **Прямые API (Steam, App Store RSS, HN Algolia, Reddit) из этой сессии недоступны** — запросы отклонены сетевым allowlist. Поэтому HN и Reddit читались через зеркала; канонические ссылки — в колонке `note`.
- **Даты двух групп приблизительные**: Battle of Flags по метке «4 years ago» (записано 2022-01), Reddit по дате снимка (2026-01). Отмечено в `note`.
- **Тред Artillery 2013 года.** Жалобы на производительность WebGL оттуда старые и сегодня могут быть неверны.
- **Выборка мала.** 6–12 упоминаний — это сигнал, не тренд. Темы из одного источника помечены «тонкая».
- **Авторазбор `reviews.py` шумный**: регулярки ловили и похвалу («1200+ hours» попал в «реиграбельность»). Списки ниже — по ручной разметке (`coding.json`), числа посчитаны `code.py`.

## 1. Что раздражает в жанре

1. **Управление: мышь на десктопе, пальцы на телефоне.** 6 строк, 3 источника (HN, Reddit, Google Play), 2022–2026.
   - "Using left click to select as well as move feels *really* unnatural to…" — https://hn.jakechampion.name/item/31296227
   - "In my view, the problem with RTS on any other platform than PC is input, how to control many units fast and efficient…" — https://reddit.sentinel-team.org/posts/1qdu0dm/snapshots/2026-01-16T09%3A10%3A34.481986Z
   - "The only problem is that the controls and navigation are kinda hard for me." — https://grand-screen.com/games/rusted-warfare-rts-strategy/reviews/
2. **Высокий порог входа: сложно, интерфейс не объясняет.** 6 строк, 4 источника, 2019–2026.
   - "It's an absolutely horrid excuse for an RTS and is far too demanding considering it's single player." — https://steamcommunity.com/app/644930/discussions/0/4626981323674891252
   - "Both times I disliked the UI, didn't want to learn what was what, and…" — там же
   - "Please make the tutorial more prominent." — https://hn.jakechampion.name/item/31296227
3. **Регистрация или установка до первой игры.** 8 строк, **тонкая: 1 источник (HN)**, 2 треда, 2013 и ~2022. Есть и возражение: "My experience is that almost 100% do sign up. Signing up is not a barrier."
   - "I opened a tab to give it a try, but backed out when I had to provide an email to see how it played." — https://hn.jakechampion.name/item/31296227
   - "I personally really really hate installing any crap on my computer or phone (apps)." — https://home6.southeastasia.cloudapp.azure.com/item?id=6412969
4. **Рывки и вылеты в браузере.** 9 строк, 2 источника (HN 2013, itch.io без даты). **Устаревшая**: 8 из 9 строк — 2013 год.
   - "As a gamer, performance is critical and stuttering ubiquitous in HTML5 games is unacceptable." — https://home6.southeastasia.cloudapp.azure.com/item?id=6412969
   - "Cool game, although it crashes quite often in the browser." — https://strangeapegames.itch.io/primordial
5. **Вечный Early Access и обещания.** 4 строки, 3 источника.
   - "Releases that might end up as eternal Early Access titles, or games that take another six years to fully launch" — https://reddit.sentinel-team.org/subreddits/RealTimeStrategy/snapshots/2026-01-16T09%3A10%3A34.481986Z
6. **Сохранения: потерянный забег.** 5 строк, **тонкая: 1 тред Steam (They Are Billions)**.
   - "If you screwed up something, then saved, reloading it is usually not going to save your run even if they did…" — https://steamcommunity.com/app/644930/discussions/0/4626981323674891252
7. **ИИ слабый или жульничает.** 2 строки, 2 источника — **тонкая**.
   - "The AI is usually braindead or cheating." — https://reddit.sentinel-team.org/posts/1qdvhd8/snapshots/2026-01-16T09%3A10%3A34.481986Z
8. **Реклама в бесплатных мобильных RTS.** 1 строка — **тонкая**, передаю в `/replica-launch` как вопрос цены.
   - "Anybody know any rts games that are mod friendly, free and I can play with without it bombarding me with ads?" — https://reddit.sentinel-team.org/posts/1qct5h6/snapshots/2026-01-16T09%3A10%3A34.481986Z

## 2. Чего не хватает

1. **Одиночная игра: кампания, скирмиш против ботов, PvE.** 12 строк, 2 источника, 3 треда. **10 из 12 — из одного треда Reddit** (1qdvhd8), так что это сильный, но узкий сигнал.
   - "Single player content is a necessity but it doesn't have to be a campaign." — https://reddit.sentinel-team.org/posts/1qdvhd8/snapshots/2026-01-16T09%3A10%3A34.481986Z
   - "Could be a campaign for each side, and a skirmish freeplay mode against bots or other people." — https://reddit.sentinel-team.org/subreddits/RealTimeStrategy/snapshots/2026-01-16T09%3A10%3A34.481986Z
   - "Its very worth the purchase, although the campaign itself is not the main draw (and easily the part of the game I found…" — https://steamcommunity.com/app/644930/discussions/0/4626981323674891252
2. **Моды.** 4 строки, **тонкая: 1 тред Reddit**.
   - "There are others, but none of them are moddable." — https://reddit.sentinel-team.org/posts/1qct5h6/snapshots/2026-01-16T09%3A10%3A34.481986Z
3. **Друзья и совместная игра.** 3 строки, 2 источника.
   - "I feel like it would significantly improve the game to have a 'friending' system." — https://apps.apple.com/au/app/mindustry/id1385258906
4. **База RTS: группы, горячие клавиши, туман войны.** 1 строка — **тонкая**.
   - "Would love to see support for viewing the group of selected units, group hot-keys, fog of war, a* path finding..." — https://hn.jakechampion.name/item/31296227

## 3. Кого жанр не обслуживает (отсюда позиционирование)

1. **Любят RTS, но играют только в одиночку и не успевают за людьми.** 5 строк, **1 тред Reddit**.
   - "I prefer a strong solo campaign, because I'm not fast or efficient enough to compete with most players in multiplayer." — https://reddit.sentinel-team.org/posts/1qdvhd8/snapshots/2026-01-16T09%3A10%3A34.481986Z
   - "If RTS were only or mainly a multiplayer genre, I would've bounced off it decades ago." — там же
2. **Хотят настоящую RTS на телефоне без рекламы.** 5 строк, 3 источника.
   - "...there are mod friendly mobile rtses?..." — https://reddit.sentinel-team.org/posts/1qct5h6/snapshots/2026-01-16T09%3A10%3A34.481986Z
   - "Are you looking to make this run well on mobile too?" — https://home6.southeastasia.cloudapp.azure.com/item?id=6412969
3. **Хотят попробовать сразу, без регистрации и установки.** 9 строк, **1 источник (HN)**.
   - "I would recommend allowing people to just pick a name and hop in." — https://hn.jakechampion.name/item/31296227

Что в жанре хвалят (ориентир, не жалоба): затягивающий survival-режим, 5 строк, 2 источника — "Billions is better, both are addictive." (https://steamcommunity.com/app/644930/discussions/0/1743355067086279791).

## Что уже есть в игре (проверено по коду 2026-11-02)

Чтобы не «чинить» то, что уже работает:
- **Без регистрации**: профиль и настройки в `localStorage` (`rts_neo_profile_v2`, `rts_neo_settings_v2` — `parity.md`).
- **Без установки и офлайн**: PWA, `sw.js` кэширует ресурсы, есть `manifest.json`.
- **ЛКМ выделяет, ПКМ приказывает** (`js/input.js:303`, `js/input.js:394`) — та самая схема, которую просили на HN.
- **Одиночная PvE-игра на волнах, выбор сложности** (`DIFFICULTY_CONFIGS` в `js/ai.js:9`, `js/economy.js:18`), **обучение, пауза по Esc**.
- **Тач-режимы панорамы и выделения** (`js/input.js:20`).

Чего нет:
- **Групп Ctrl+1…9.** Цифры 1–3 заняты способностями (`js/input.js:646-650`).
- **Сохранения посреди матча.** В `js/storage.js` только профиль и настройки.
- **Скирмиша против ИИ со своей экономикой** («should» в `parity.md`).

## План исправлений

Отбор: сила сигнала × дешевизна. Размер: S — до дня, M — несколько дней, L — неделя и больше.

| # | что сделать | размер | скилл | основание |
|---|---|---|---|---|
| F1 | Армия на таче без рамки: кнопка «вся армия» и приказ «атаковать сюда» одним касанием; на десктопе группы Ctrl+1…9 (способности перенести на Q/E/R, они уже там продублированы) | M | replica-build | управление: 6 строк, 3 источника; база RTS: 1 строка |
| F2 | Режим для новичков: сложность «спокойная», замедление игры ×0.5, подсказки к первой волне поверх обучения | S–M | replica-build | порог входа: 6 строк, 4 источника; соло и медленные: 5 строк |
| F3 | Скирмиш против ИИ со своей экономикой (уже в `parity.md` как should) | L | replica-build | одиночная игра: 12 строк (10 из одного треда) |
| F4 | Сохранение посреди матча с продолжением (одно автосохранение на волну) — короткие сессии на телефоне | M | replica-build + replica-test | сохранения: 5 строк, 1 тред — тонкая |
| F5 | Доказать, что браузер тянет: прогон бенчмарка на реальных устройствах (ноутбук + телефон), цифры FPS в README и на лендинге, авто-понижение качества при просадке | M | replica-test, потом replica-launch | рывки: 9 строк, но 2013 год — устаревшая |
| F6 | Ссылка на карту по сиду («сыграй ту же карту») вместо регистрации и мультиплеера | S | replica-build | вход без регистрации: 9 строк, 1 источник; друзья: 3 строки |

Цена и реклама (1 строка) → `/replica-launch`: продавать без рекламы, это отличие, а не жалоба на нас.

## Позиционирование: три варианта

**A. Соло-RTS для тех, кто не тянет мультиплеер**
For RTS-игроков, которые играют только в одиночку и не успевают за людьми в мультиплеере, {{твоя игра}} — это волны роя против ИИ с паузой и выбором сложности, без онлайна и без кампании, которую надо «проходить».
Evidence: «Одиночная игра» — 12 строк, 2 источника (10 из одного треда); «Порог входа» — 6 строк, 4 источника.

**B. Настоящая RTS на телефоне и в браузере, без рекламы и установки**
For тех, кто хочет RTS на телефоне или чужом ноутбуке, но находит только рекламу и сторы, {{твоя игра}} открывается по ссылке, работает офлайн и управляется пальцем.
Evidence: «Управление» — 6 строк, 3 источника; «Без регистрации и установки» — 9 строк, 1 источник (тонкая); «Реклама» — 1 строка.

**C. Тысячи дронов прямо во вкладке**
For тех, кто считает браузерные игры «казуальными и дешёвыми», {{твоя игра}} показывает масштаб роя в браузере с цифрами FPS.
Evidence: «Рывки в браузере» — 9 строк, 2 источника, но почти всё 2013 года; «Браузерные игры считают казуальными» — 4 строки, 1 источник. Самый слабый вариант по доказательствам.

**Рекомендация: A как обещание, B как способ доставки.** У A самая широкая база: «одиночная игра» и «порог входа» вместе — 17 разных строк из 4 источников (12 + 6, одна строка в обеих темах; посчитано по `coding.json`). И игра уже это умеет: PvE-волны, сложность, пауза. B — то, как человек до неё доходит: ссылка, офлайн, тач. C — тема для технической статьи на HN, а не для главного экрана.

Конкурентов (They Are Billions, Mindustry, Rusted Warfare) не упоминать ни в названии, ни в рекламе, ни в листинге. Страница сравнения — вопрос к юристу в твоей стране.
