# 🎨 3D RTS в браузере без единой внешней текстуры и аудиофайла: процедурный PBR на Canvas и Web Audio API

> Архитектура Zero-Assets: как создать визуально насыщенную космическую стратегию с металлическими шейдерами, мягкими тенями и сочным звуком с общим весом бандла менее 1 MB и нулевым количеством сетевых запросов.

---

## 1. Проблема традиционных веб-игр: балласт ассетов и CORS

При разработке 3D-игр в браузере типичный стек включает:
- 15–50 MB скачиваемых `.gltf` / `.fbx` моделей.
- 40–100 MB PNG/JPG текстур (Albedo, Normal, Roughness, AO).
- 20–40 MB звуковых файлов (`.mp3` / `.wav`).

Это приводит к долгой загрузке (Load Screen > 15 секунд), необходимости запуска локального веб-сервера из-за ограничений **CORS** (`file:///` протокол блокирует `fetch` локальных текстур) и сложностям с кэшированием.

**Задача проекта Minimal Web RTS:** Достичь **Zero-Asset Architecture** — запустить трёхмерную RTS с полноценным PBR-освещением, тенями, взрывами, музыкой и спецэффектами двойным кликом по `index.html` прямо из файловой системы.

---

## 2. Процедурный PBR-пайплайн на HTML5 Canvas

Вместо загрузки растровых изображений все текстуры генерируются динамически в памяти браузера через `HTMLCanvasElement` и заворачиваются в `THREE.CanvasTexture`:

### 2.1. Albedo (Цвет и диффузные детали)
На холсте $512 \times 512$ рисуются титановые композитные плиты, фаски кромок, монтажные болты, технологические швы и микропоры металла:
```javascript
function createGroundAlbedoTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    // Отрисовка субпанелей, градиентов и заклепок...
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(11, 11);
    return texture;
}
```

### 2.2. Normal Map (Тангенциальная карта нормалей)
Карта нормалей формируется расчётом пространственного градиента высот Соболева / центральных разностей:
$$dx = \frac{H(x+1, y) - H(x-1, y)}{2}, \quad dy = \frac{H(x, y+1) - H(x, y-1)}{2}$$
Вектор нормали $\vec{N} = \text{normalize}(-dx, -dy, 1.0)$ преобразуется в RGB-каналы:
$$\text{Color} = \left( \frac{\vec{N}_x + 1}{2} \times 255, \; \frac{\vec{N}_y + 1}{2} \times 255, \; \frac{\vec{N}_z + 1}{2} \times 255 \right)$$

### 2.3. Emissive Map (Неоновые энергомагистрали)
Поверх плит накладывается слой свечения в темноте: бирюзовые проводящие дорожки и узловые порты питания с эмиссионной интенсивностью, реагирующие на кинематографичный компрессор тонов `ACESFilmicToneMapping`.

---

## 3. Синтез звука в реальном времени (Web Audio API)

В `js/audio.js` отсутствуют аудиофайлы. Звуки синтезируются на базе узлов `AudioContext`:

```
[ OscillatorNode / NoiseBuffer ] ──> [ BiquadFilterNode ] ──> [ GainNode (ADSR) ] ──> [ DynamicsCompressorNode ] ──> Destination
```

### 3.1. Генерация взрывов (Noise + Sub-bass sweep)
Взрыв создаётся воспроизведением предрассчитанного буфера белого шума, пропущенного через резкую низкочастотную развёртку `BiquadFilterNode` (спад с 800 Гц до 30 Гц за 0.6 с) в сочетании с саб-басовым синусоидальным импульсом.

### 3.2. Мастер-компрессор и защита от клиппинга
При столкновении сотен юнитов и одновременной стрельбе десятков лазеров звук без компрессии превращается в цифровой треск (clipping). 
Мы внедрили `DynamicsCompressorNode` на мастер-выходе:
```javascript
this.compressor = this.ctx.createDynamicsCompressor();
this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime); // Сжатие при > -14 dB
this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
```

### 3.3. Процедурный космический эмбиент
Фоновая музыка создаётся тремя расстроенными синусоидальными генераторами низкой частоты (55 Гц, 82.5 Гц, 110 Гц) с мягким фильтром и модуляцией LFO каждые 12 секунд.

---

## 4. Итоговая телеметрия бандла

| Компонент | Традиционный подход | Minimal Web RTS (Zero-Assets) |
|---|---|---|
| **3D-модели и сетки** | 25 MB (.gltf) | **0 KB** (Procedural Three.js Geometries) |
| **Текстуры и декали** | 45 MB (.png) | **0 KB** (Canvas PBR ~8.75 MB VRAM) |
| **Аудиодорожки и SFX** | 30 MB (.mp3) | **0 KB** (Web Audio API синтезатор) |
| **Код игры (HTML+CSS+JS)** | ~2 MB | **~235 KB** |
| **Сетевые запросы к ассетам**| 120+ HTTP-запросов | **0 запросов** |
| **Время загрузки игры** | 8–15 секунд | **< 0.1 секунды (Мгновенно)** |
