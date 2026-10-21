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

        // Телеметрия и бенчмаркинг алгоритма коллизий
        this.collisionMode = 'spatial'; // 'spatial' (O(N)) или 'naive' (O(N²))
        this.pairsTested = 0;
        this.lastPairsTested = 0;
    }

    // Очистка списков ячеек без выделения новой памяти (zero GC pauses)
    clear() {
        const len = this.cells.length;
        for (let i = 0; i < len; i++) {
            this.cells[i].allies.length = 0;
            this.cells[i].enemies.length = 0;
            this.cells[i].all.length = 0;
        }
        this.lastPairsTested = this.pairsTested;
        this.pairsTested = 0;
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

    // Поиск оптимальной цели заданной команды с учётом тактического приоритета
    // (Focus Fire по раненым целям и приоритет осадным орудиям)
    findNearest(pos, maxDist, targetTeam, usePriority = true) {
        const cMin = Math.max(0, Math.floor((pos.x - maxDist + this.halfMap) / this.cellSize));
        const cMax = Math.min(this.cols - 1, Math.floor((pos.x + maxDist + this.halfMap) / this.cellSize));
        const rMin = Math.max(0, Math.floor((pos.z - maxDist + this.halfMap) / this.cellSize));
        const rMax = Math.min(this.rows - 1, Math.floor((pos.z + maxDist + this.halfMap) / this.cellSize));

        let nearest = null;
        let minDist = maxDist;
        let bestScore = maxDist + 999;
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
                    if (d > maxDist) continue;

                    if (!usePriority) {
                        if (d < minDist) {
                            minDist = d;
                            nearest = u;
                        }
                    } else {
                        // Тактический скоринг:
                        // 1. Раненые цели получают приоритет (Focus Fire для быстрого снятия урона противника)
                        const hpRatio = Math.max(0, Math.min(1, u.hp / (u.maxHp || 100)));
                        const woundedBonus = (1.0 - hpRatio) * 1.8;
                        // 2. Опасные осадные платформы и боссы имеют высокий приоритет
                        const threatBonus = (u.isSieged ? 2.5 : (u.type === 'tank' ? 1.5 : (u.type === 'boss' ? 2.2 : 0)));
                        const score = d - woundedBonus - threatBonus;

                        if (score < bestScore) {
                            bestScore = score;
                            minDist = d;
                            nearest = u;
                        }
                    }
                }
            }
        }
        return { unit: nearest, dist: minDist };
    }

    // Расталкивание юнитов:
    // В режиме 'spatial' (O(N)): проверка пар только внутри ячейки и с 4 смежными ячейками.
    // В режиме 'naive' (O(N²)): полный перебор всех возможных пар для демонстрации просадки FPS.
    resolveSeparation(allUnits) {
        if (this.collisionMode === 'naive') {
            this.resolveSeparationNaive(allUnits);
            return;
        }

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

    // Наивный квадратичный алгоритм O(N²) без разбиения на ячейки
    resolveSeparationNaive(allUnits) {
        if (!allUnits) return;
        const len = allUnits.length;
        for (let i = 0; i < len; i++) {
            const u1 = allUnits[i];
            if (u1.hp <= 0) continue;
            const p1 = u1.mesh.position;

            for (let j = i + 1; j < len; j++) {
                const u2 = allUnits[j];
                if (u2.hp <= 0) continue;
                const p2 = u2.mesh.position;
                this._collidePair(u1, u2, p1, p2);
            }
        }
    }

    _collidePair(u1, u2, p1, p2) {
        this.pairsTested++;
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
            const overlap = minDist - dist;

            // Учет осадного режима и массы юнитов при разделении
            const s1 = !!u1.isSieged;
            const s2 = !!u2.isSieged;

            if (s1 && s2) {
                p1.x -= nx * overlap * 0.5;
                p1.z -= nz * overlap * 0.5;
                p2.x += nx * overlap * 0.5;
                p2.z += nz * overlap * 0.5;
            } else if (s1) {
                // u1 зафиксирован на грунте — отталкиваем только u2
                p2.x += nx * overlap;
                p2.z += nz * overlap;
            } else if (s2) {
                // u2 зафиксирован на грунте — отталкиваем только u1
                p1.x -= nx * overlap;
                p1.z -= nz * overlap;
            } else {
                // Распределение импульса по массе (квадрат радиуса)
                const m1 = u1.radius * u1.radius;
                const m2 = u2.radius * u2.radius;
                const totalM = m1 + m2;
                const w1 = totalM > 0 ? (m2 / totalM) : 0.5;
                const w2 = totalM > 0 ? (m1 / totalM) : 0.5;

                p1.x -= nx * overlap * w1;
                p1.z -= nz * overlap * w1;
                p2.x += nx * overlap * w2;
                p2.z += nz * overlap * w2;
            }
        }
    }
}

// Глобальный экземпляр пространственного хеша (размер ячейки 4.0 = охватывает радиусы любых юнитов)
const spatialGrid = new SpatialGrid(MAP_WORLD_SIZE, 4.0);
