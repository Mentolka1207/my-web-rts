// =============================================================================
// js/spatialhash.js — Пространственное хеширование (Spatial Grid)
// Ускоряет поиск ближайших целей и расталкивание юнитов с O(n²) до O(n)
// Zero-allocation: переиспользование массивов ячеек без пауз Garbage Collector
// =============================================================================

class SpatialGrid {
    constructor(worldSize, cellSize) {
        this.cellSize = cellSize;
        this.worldSize = worldSize;
        this.halfMap = worldSize * 0.5;
        this.cols = Math.ceil(worldSize / cellSize);
        this.rows = Math.ceil(worldSize / cellSize);
        const total = this.cols * this.rows;

        // Ячейки сетки: раздельные списки для союзников, врагов и всех юнитов ячейки
        this.cells = Array(total).fill(null).map(() => ({
            allies: [],
            enemies: [],
            all: []
        }));

        // Смещения 4 прямых соседей (устраняют дублирование пар ячеек при коллизиях):
        // Вправо (1,0), вниз-влево (-1,1), вниз (0,1), вниз-вправо (1,1)
        this.dCols = [1, -1, 0, 1];
        this.dRows = [0,  1, 1, 1];
    }

    // Очистка списков ячеек без выделения новой памяти (zero GC pauses)
    clear() {
        const len = this.cells.length;
        for (let i = 0; i < len; i++) {
            this.cells[i].allies.length = 0;
            this.cells[i].enemies.length = 0;
            this.cells[i].all.length = 0;
        }
    }

    // Вставка юнита в соответствующую ячейку
    insert(unit, isEnemy) {
        const p = unit.mesh.position;
        const c = Math.floor((p.x + this.halfMap) / this.cellSize);
        const r = Math.floor((p.z + this.halfMap) / this.cellSize);
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
            const cell = this.cells[r * this.cols + c];
            cell.all.push(unit);
            if (isEnemy) {
                cell.enemies.push(unit);
            } else {
                cell.allies.push(unit);
            }
        }
    }

    // Поиск ближайшей цели заданной команды в радиусе maxDist
    // targetTeam: 'enemy' (ищет врагов) или 'ally' (ищет союзников)
    findNearest(pos, maxDist, targetTeam) {
        const cMin = Math.max(0, Math.floor((pos.x - maxDist + this.halfMap) / this.cellSize));
        const cMax = Math.min(this.cols - 1, Math.floor((pos.x + maxDist + this.halfMap) / this.cellSize));
        const rMin = Math.max(0, Math.floor((pos.z - maxDist + this.halfMap) / this.cellSize));
        const rMax = Math.min(this.rows - 1, Math.floor((pos.z + maxDist + this.halfMap) / this.cellSize));

        let nearest = null;
        let minDist = maxDist;
        const isEnemyTarget = (targetTeam === 'enemy');

        for (let r = rMin; r <= rMax; r++) {
            const rowOffset = r * this.cols;
            for (let c = cMin; c <= cMax; c++) {
                const list = isEnemyTarget ? this.cells[rowOffset + c].enemies : this.cells[rowOffset + c].allies;
                const len = list.length;
                for (let i = 0; i < len; i++) {
                    const u = list[i];
                    if (u.hp <= 0) continue;
                    const d = pos.distanceTo(u.mesh.position);
                    if (d < minDist) {
                        minDist = d;
                        nearest = u;
                    }
                }
            }
        }
        return { unit: nearest, dist: minDist };
    }

    // Высокопроизводительное расталкивание юнитов: проверка пар только внутри ячейки
    // и с 4 смежными ячейками. Каждая пара проверяется ровно 1 раз.
    resolveSeparation() {
        for (let r = 0; r < this.rows; r++) {
            const rowOffset = r * this.cols;
            for (let c = 0; c < this.cols; c++) {
                const cell = this.cells[rowOffset + c];
                const list = cell.all;
                const len = list.length;
                if (len === 0) continue;

                // 1. Коллизии внутри одной ячейки (i < j)
                for (let i = 0; i < len; i++) {
                    const u1 = list[i];
                    if (u1.hp <= 0) continue;
                    const p1 = u1.mesh.position;

                    for (let j = i + 1; j < len; j++) {
                        const u2 = list[j];
                        if (u2.hp <= 0) continue;
                        const p2 = u2.mesh.position;
                        this._collidePair(u1, u2, p1, p2);
                    }
                }

                // 2. Коллизии с 4 соседними ячейками
                for (let n = 0; n < 4; n++) {
                    const nc = c + this.dCols[n];
                    const nr = r + this.dRows[n];
                    if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
                    const nList = this.cells[nr * this.cols + nc].all;
                    const nLen = nList.length;
                    if (nLen === 0) continue;

                    for (let i = 0; i < len; i++) {
                        const u1 = list[i];
                        if (u1.hp <= 0) continue;
                        const p1 = u1.mesh.position;

                        for (let j = 0; j < nLen; j++) {
                            const u2 = nList[j];
                            if (u2.hp <= 0) continue;
                            const p2 = u2.mesh.position;
                            this._collidePair(u1, u2, p1, p2);
                        }
                    }
                }
            }
        }
    }

    _collidePair(u1, u2, p1, p2) {
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const distSq = dx * dx + dz * dz;
        const minDist = u1.radius + u2.radius;

        if (distSq < minDist * minDist) {
            let dist = Math.sqrt(distSq);
            let nx, nz;
            if (dist > 0.0001) {
                nx = dx / dist;
                nz = dz / dist;
            } else {
                nx = 1; nz = 0;
                dist = 0.0001;
            }
            const overlap = (minDist - dist) * 0.5;
            p1.x -= nx * overlap;
            p1.z -= nz * overlap;
            p2.x += nx * overlap;
            p2.z += nz * overlap;
        }
    }
}

// Глобальный экземпляр пространственного хеша (размер ячейки 4.0 = охватывает радиусы любых юнитов)
const spatialGrid = new SpatialGrid(MAP_WORLD_SIZE, 4.0);
