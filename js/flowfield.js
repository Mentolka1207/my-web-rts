// =============================================================================
// js/flowfield.js — Высокопроизводительный поиск пути Flow Field (BFS на TypedArray)
// =============================================================================

class FlowFieldGenerator {
    constructor(gridWidth, gridHeight, cellSize) {
        this.width = gridWidth;
        this.height = gridHeight;
        this.cellSize = cellSize;
        this.totalCells = this.width * this.height;

        this.costField = Array(this.height).fill(null).map((_, r) =>
            Array(this.width).fill(null).map((_, c) => grid[r][c] === 1 ? 255 : 1)
        );
        this.integrationField = Array(this.height).fill(null).map(() => Array(this.width).fill(65535));
        this.flowField = Array(this.height).fill(null).map(() =>
            Array(this.width).fill(null).map(() => new THREE.Vector2(0, 0))
        );

        this.queue = new Int32Array(this.totalCells);
    }

    generateIntegrationField(targetCol, targetRow) {
        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width; c++) {
                this.integrationField[r][c] = 65535;
            }
        }

        let head = 0;
        let tail = 0;
        this.integrationField[targetRow][targetCol] = 0;
        this.queue[tail++] = (targetRow * this.width) + targetCol;

        while (head < tail) {
            const packed = this.queue[head++];
            const c = packed % this.width;
            const r = (packed / this.width) | 0;
            const currentCost = this.integrationField[r][c];

            const nC = [c + 1, c - 1, c, c];
            const nR = [r, r, r + 1, r - 1];

            for (let i = 0; i < 4; i++) {
                const nc = nC[i];
                const nr = nR[i];
                if (nc < 0 || nc >= this.width || nr < 0 || nr >= this.height) continue;
                const stepCost = this.costField[nr][nc];
                if (stepCost === 255) continue;
                const totalCost = currentCost + stepCost;
                if (totalCost < this.integrationField[nr][nc]) {
                    this.integrationField[nr][nc] = totalCost;
                    this.queue[tail++] = (nr * this.width) + nc;
                }
            }
        }
    }

    generateFlowField() {
        for (let r = 0; r < this.height; r++) {
            for (let c = 0; c < this.width; c++) {
                if (this.costField[r][c] === 255) {
                    this.flowField[r][c].set(0, 0);
                    continue;
                }
                let minCost = this.integrationField[r][c];
                let bestDx = 0;
                let bestDy = 0;

                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        const nc = c + dx;
                        const nr = r + dy;
                        if (nc < 0 || nc >= this.width || nr < 0 || nr >= this.height) continue;
                        const neighborCost = this.integrationField[nr][nc];
                        if (neighborCost < minCost) {
                            minCost = neighborCost;
                            bestDx = dx;
                            bestDy = dy;
                        }
                    }
                }

                if (bestDx === 0 && bestDy === 0) {
                    this.flowField[r][c].set(0, 0);
                } else {
                    this.flowField[r][c].set(bestDx, bestDy).normalize();
                }
            }
        }
    }

    updateTarget(targetCol, targetRow) {
        this.generateIntegrationField(targetCol, targetRow);
        this.generateFlowField();
    }
}

const flowFieldGen = new FlowFieldGenerator(GRID_SIZE, GRID_SIZE, CELL_SIZE);
const enemyFlowFieldGen = new FlowFieldGenerator(GRID_SIZE, GRID_SIZE, CELL_SIZE);
enemyFlowFieldGen.updateTarget(HQ_COL, HQ_ROW);
