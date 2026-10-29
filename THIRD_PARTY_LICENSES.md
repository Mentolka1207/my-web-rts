# Лицензии сторонних библиотек (Third-Party Licenses)

Проект **Minimal Web RTS** построен по архитектуре **Zero External Assets** (без внешних аудиофайлов, текстур и 3D-моделей) и использует только одну внешнюю библиотеку для WebGL-рендеринга — **Three.js**.

---

## 1. Three.js

* **Библиотека:** Three.js (v0.186.1 / r186)
* **Сайт проекта:** https://threejs.org
* **Репозиторий:** https://github.com/mrdoob/three.js
* **Файл в проекте:** `libs/three.min.js`
* **Лицензия:** The MIT License (MIT)

### Текст лицензии MIT:

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 2. Собственные компоненты игры

Все остальные компоненты игры разработаны автором с нуля без использования сторонних коммерческих библиотек или проприетарных ассетов:
* Процедурный синтезатор звука и космического эмбиента на Web Audio API (`js/audio.js`)
* Процедурные PBR-текстуры металлов, швов и рельефа на HTML5 Canvas (`js/terrain.js`)
* Процедурные 3D-модели дронов, танков, флагмана-Левиафана и штабов (`js/models.js`)
* Алгоритм навигации векторных полей потоков Flow Fields на BFS (`js/flowfield.js`)
* Пространственное хеширование Spatial Grid для расталкивания юнитов (`js/spatialhash.js`)
