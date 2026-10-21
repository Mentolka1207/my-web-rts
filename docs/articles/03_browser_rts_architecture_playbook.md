# 🛠️ Практический туториал: Создание масштабируемой браузерной 3D RTS на Three.js с нуля

> Пошаговое руководство по созданию движка стратегии в реальном времени: от Fixed Timestep симуляции и Data-Oriented SoA до векторных полей Flow Fields и GPU Instancing.

---

## Введение

Создание стратегии реального времени в браузере часто пугает разработчиков: как только число юнитов переваливает за сотню, WebGL захлёбывается в тысячах Draw Calls, алгоритмы поиска пути вешают процессор, а браузер зависает.

В этом руководстве мы разберём архитектурный рецепт, позволяющий запускать баталии на 1 500+ юнитов при стабильных 60 FPS на ванильном JavaScript и Three.js.

---

## Шаг 1. Детерминированный игровой цикл (Fixed Timestep)

Никогда не привязывайте физику и симуляцию напрямую к переменному `delta` в `requestAnimationFrame`! Это приводит к недетерминированному поведению и делает невозможным сетевой Lockstep или реплеи.

Используйте аккумулятор с фиксированным квантом времени ($\Delta t = 1/30\text{с} \approx 33.33\text{ms}$):

```javascript
const FIXED_TIMESTEP = 1 / 30;
let simAccumulator = 0;

function animate(timestamp) {
    requestAnimationFrame(animate);
    const rawDelta = Math.min(clock.getDelta(), 0.15);

    simAccumulator += rawDelta;
    let maxTicks = 4; // Защита от спирали смерти (Spiral of Death)
    
    while (simAccumulator >= FIXED_TIMESTEP && maxTicks > 0) {
        stepSimulation(FIXED_TIMESTEP);
        simAccumulator -= FIXED_TIMESTEP;
        maxTicks--;
    }

    renderScene();
}
```

Для случайных событий используйте сидируемый 32-битный генератор псевдослучайных чисел (Mulberry32 PRNG) вместо недетерминированного `Math.random()`.

---

## Шаг 2. Data-Oriented Design (SoA — Structure of Arrays)

Объектно-ориентированный подход (`class Unit { constructor() { this.pos = new THREE.Vector3(); } }`) фрагментирует память и создаёт лишнюю нагрузку на GC.

Вместо этого используем структуру массивов:
```javascript
class SimulationWorld {
    constructor(maxCount = 2000) {
        this.posX = new Float32Array(maxCount);
        this.posZ = new Float32Array(maxCount);
        this.velX = new Float32Array(maxCount);
        this.velZ = new Float32Array(maxCount);
        this.hp = new Float32Array(maxCount);
        this.state = new Uint8Array(maxCount); // 0: IDLE, 1: MOVE, 2: CHASE, 3: ATTACK
    }
}
```

Такое хранение:
1. Обеспечивает непрерывность памяти и максимальное попадание в кэш процессора (CPU L1/L2 cache locality).
2. Позволяет передавать состояние симуляции между Web Worker и главным потоком за $0.01\text{ms}$ через **Transferable Objects** (`postMessage({ buffer }, [buffer])`).

---

## Шаг 3. Векторные поля потоков (Flow Fields)

Вместо $N$ раздельных путей A\* рассчитывается одно волновое поле integration field:
1. Заполнить сетку расстояний числом $\infty$ (например, 65535).
2. Поместить клетку цели в очередь со значением 0.
3. Обойти всю карту поиском в ширину (BFS).
4. Каждой ячейке сопоставить нормализованный вектор градиента падения значений.
5. Любой юнит просто считывает свой текущий вектор:
   ```javascript
   const gridCol = Math.floor((posX + halfMap) / cellSize);
   const gridRow = Math.floor((posZ + halfMap) / cellSize);
   const flowVec = flowField[gridRow][gridCol];
   velX = flowVec.x * speed;
   velZ = flowVec.y * speed;
   ```

---

## Шаг 4. GPU Instancing: Сокращение Draw Calls с 12 000 до ~16

Если создать 1 500 юнитов, каждый из которых состоит из 8 геометрий (корпус, крылья, визоры, орудия), Three.js совершит $1500 \times 8 = 12\,000$ вызовов отрисовки (`gl.drawElements`). 

Решение:
1. Объединить все части модели юнита в единый `THREE.BufferGeometry` через объединение вершинных буферов.
2. Создать один `THREE.InstancedMesh(geometry, material, MAX_INSTANCES)`.
3. За один кадр упаковывать матрицы трансформации всех активных юнитов:
   ```javascript
   dummyMatrix.compose(pos, quat, scale);
   instancedMesh.setMatrixAt(index, dummyMatrix);
   instancedMesh.count = activeUnitsCount;
   instancedMesh.instanceMatrix.needsUpdate = true;
   ```
4. Для полосок здоровья применить единый `InstancedMesh` со сферическим биллбордингом прямо в вершинном шейдере:
   ```glsl
   vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
   mvPosition.xy += position.xy; // Биллбординг на GPU без тригонометрии на CPU
   gl_Position = projectionMatrix * mvPosition;
   ```

---

## Шаг 5. Пространственное хеширование (Spatial Hash)

Для мгновенного расталкивания юнитов и поиска целей:
1. Распределите юнитов по корзинам сетки с шагом ячейки $\approx 4.0$.
2. Проверяйте столкновения юнита только с объектами в его корзине и 4 соседних.
3. Время тика физики на 1 500 юнитах падает с 75 ms до **1.6 ms**, обеспечивая стабильные 60 FPS.
