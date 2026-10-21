// =============================================================================
// js/flowfield.js — Высокопроизводительный поиск пути Flow Field (BFS на TypedArray)
// Кэширование целевых полей (LRU Cache), ленивая очередь запросов и версионирование
// =============================================================================

let globalGridRevision = 1;

// Инвалидация кэша полей при изменении проходимости (Siege Mode, постройки)
function invalidateFlowFieldCache() {
    globalGridRevision++;
}

class FlowFieldGenerator {
    constructor(gridWidth, gridHeight, cellSize) {
        this.width = gridWidth;
        this.height = gridHeight;
        this.cellSize = cellSize;
        this.totalCells = this.width * this.height;

        this.costField = Array(this.height).fill(null).map((_, r) =>
            Array(this.width).fill(null).map((_, c) => grid[r][c] === 1 ? 255 : 1)
        );

        // 2D структуры для обратной совместимости с существующим кодом
        this.integrationField = Array(this.height).fill(null).map(() => Array(this.width).fill(65535));
        this.flowField = Array(this.height).fill(null).map(() =>
            Array(this.width).fill(null).map(() => new THREE.Vector2(0, 0))
        );

        // Плоские типизированные массивы для сверхбыстрого кэширования и BFS
        this.integrationFlat = new Uint16Array(this.totalCells);
        this.flowVectorsX = new Float32Array(this.totalCells);
        this.flowVectorsY = new Float32Array(this.totalCells);
        this.queue = new Int32Array(this.totalCells);

        // LRU-кэш рассчитанных полей по целевым координатам (до 16 полей)
        this.cache = new Map();
        this.maxCacheSize = 16;
        this.currentTargetCol = -1;
        this.currentTargetRow = -1;
        this.cachedGridRevision = 0;
        this.pendingTarget = null;
        this.lastComputeTime = 0;
    }

    generateIntegrationField(targetCol, targetRow) {
        this.integrationFlat.fill(65535);

        let head = 0;
        let tail = 0;
        const targetIdx = (targetRow * this.width) + targetCol;
        this.integrationFlat[targetIdx] = 0;
        this.queue[tail++] = targetIdx;

        while (head < tail) {
            const packed = this.queue[head++];
            const c = packed % this.width;
            const r = (packed / this.width) | 0;
            const currentCost = this.integrationFlat[packed];

            const nC = [c + 1, c - 1, c, c];
            const nR = [r, r, r + 1, r - 1];

            for (let i = 0; i < 4; i++) {
                const nc = nC[i];
                const nr = nR[i];
                if (nc < 0 || nc >= this.width || nr < 0 || nr >= this.height) continue;
                const stepCost = this.costField[nr][nc];
                if (stepCost === 255) continue;
                const totalCost = currentCost + stepCost;
                const nIdx = (nr * this.width) + nc;
                if (totalCost < this.integrationFlat[nIdx]) {
                    this.integrationFlat[nIdx] = totalCost;
                    this.queue[tail++] = nIdx;
                }
            }
        }

        // Синхронизация 2D массива интеграции
        for (let r = 0; r < this.height; r++) {
            const rowOff = r * this.width;
            for (let c = 0; c < this.width; c++) {
                this.integrationField[r][c] = this.integrationFlat[rowOff + c];
            }
        }
    }

    generateFlowField() {
        for (let r = 0; r < this.height; r++) {
            const rowOff = r * this.width;
            for (let c = 0; c < this.width; c++) {
                const idx = rowOff + c;
                if (this.costField[r][c] === 255) {
                    this.flowVectorsX[idx] = 0;
                    this.flowVectorsY[idx] = 0;
                    this.flowField[r][c].set(0, 0);
                    continue;
                }
                let minCost = this.integrationFlat[idx];
                let bestDx = 0;
                let bestDy = 0;

                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nc = c + dx;
                        const nr = r + dy;
                        if (nc < 0 || nc >= this.width || nr < 0 || nr >= this.height) continue;
                        // Диагональное движение запрещено через углы препятствий
                        if (dx !== 0 && dy !== 0) {
                            if (this.costField[r][c + dx] === 255 || this.costField[r + dy][c] === 255) {
                                continue;
                            }
                        }
                        const neighborCost = this.integrationFlat[(nr * this.width) + nc];
                        if (neighborCost < minCost) {
                            minCost = neighborCost;
                            bestDx = dx;
                            bestDy = dy;
                        }
                    }
                }

                if (bestDx === 0 && bestDy === 0) {
                    this.flowVectorsX[idx] = 0;
                    this.flowVectorsY[idx] = 0;
                    this.flowField[r][c].set(0, 0);
                } else {
                    const len = Math.hypot(bestDx, bestDy);
                    const nx = bestDx / len;
                    const ny = bestDy / len;
                    this.flowVectorsX[idx] = nx;
                    this.flowVectorsY[idx] = ny;
                    this.flowField[r][c].set(nx, ny);
                }
            }
        }
    }

    // Ленивая очередь обновлений: если за один тик пришло несколько кликов,
    // выполняется только финальный пересчёт
    queueTarget(targetCol, targetRow) {
        this.pendingTarget = { col: targetCol, row: targetRow };
    }

    processPendingTarget() {
        if (!this.pendingTarget) return;
        const target = this.pendingTarget;
        this.pendingTarget = null;
        this.updateTarget(target.col, target.row);
    }

    // Обновление целевой точки с проверкой LRU кэша
    updateTarget(targetCol, targetRow, force = false) {
        // 1. Быстрый выход: цель уже рассчитана и проходимость карты не менялась
        if (!force &&
            this.currentTargetCol === targetCol &&
            this.currentTargetRow === targetRow &&
            this.cachedGridRevision === globalGridRevision) {
            this.lastComputeTime = 0;
            return;
        }

        const t0 = performance.now();
        const cacheKey = `${targetCol}_${targetRow}`;
        const cached = this.cache.get(cacheKey);

        // 2. Попадание в LRU кэш: копирование плоских буферов (< 0.05 мс)
        if (!force && cached && cached.revision === globalGridRevision) {
            this.integrationFlat.set(cached.integration);
            this.flowVectorsX.set(cached.flowX);
            this.flowVectorsY.set(cached.flowY);

            for (let r = 0; r < this.height; r++) {
                const rowOff = r * this.width;
                for (let c = 0; c < this.width; c++) {
                    const idx = rowOff + c;
                    this.integrationField[r][c] = this.integrationFlat[idx];
                    this.flowField[r][c].set(this.flowVectorsX[idx], this.flowVectorsY[idx]);
                }
            }

            this.currentTargetCol = targetCol;
            this.currentTargetRow = targetRow;
            this.cachedGridRevision = globalGridRevision;
            this.lastComputeTime = performance.now() - t0;
            return;
        }

        // 3. Промах кэша: полный расчет поля Дейкстры и векторов
        this.generateIntegrationField(targetCol, targetRow);
        this.generateFlowField();

        // Сохранение в кэш
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(cacheKey, {
            integration: new Uint16Array(this.integrationFlat),
            flowX: new Float32Array(this.flowVectorsX),
            flowY: new Float32Array(this.flowVectorsY),
            revision: globalGridRevision
        });

        this.currentTargetCol = targetCol;
        this.currentTargetRow = targetRow;
        this.cachedGridRevision = globalGridRevision;
        this.lastComputeTime = performance.now() - t0;
    }
}

const flowFieldGen = new FlowFieldGenerator(GRID_SIZE, GRID_SIZE, CELL_SIZE);
const enemyFlowFieldGen = new FlowFieldGenerator(GRID_SIZE, GRID_SIZE, CELL_SIZE);
enemyFlowFieldGen.updateTarget(HQ_COL, HQ_ROW);
