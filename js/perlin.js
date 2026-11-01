// =============================================================================
// js/perlin.js — Процедурный генератор 2D шума Перлина (Improved Perlin Noise)
// Полная автономность, нулевые зависимости, поддержка сидов и многооктавного FBM
// =============================================================================

class PerlinNoise {
    constructor(seed = 1337) {
        this.perm = new Uint8Array(512);
        this.setSeed(seed);
    }

    /**
     * Инициализация перестановки (Permutation Table) на базе детерминированного PRNG
     * @param {number|string} seed 
     */
    setSeed(seed) {
        let s = 1337;
        if (typeof seed === 'string') {
            const parsed = parseInt(seed.trim(), 10);
            if (!isNaN(parsed) && String(parsed) === seed.trim()) {
                s = parsed >>> 0;
            } else {
                let h = 0;
                for (let i = 0; i < seed.length; i++) {
                    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
                }
                s = Math.abs(h) >>> 0;
            }
        } else if (typeof seed === 'number' && !isNaN(seed)) {
            s = (seed >>> 0) || 1;
        }
        if (s === 0) s = 1;
        this.currentSeed = s;

        // Детерминированный генератор Mulberry32 для перестановки Фишера-Йетса
        function mulberry32() {
            let t = (s += 0x6D2B79F5) >>> 0;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(mulberry32() * (i + 1));
            const tmp = p[i];
            p[i] = p[j];
            p[j] = tmp;
        }

        // Заполнение дублированной таблицы (размер 512 для быстрого побитового доступа)
        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
        }
    }

    getSeed() {
        return this.currentSeed;
    }

    // Сглаживающая квинтика Кена Перлина: 6t^5 - 15t^4 + 10t^3
    static _fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    static _lerp(a, b, t) {
        return a + t * (b - a);
    }

    // 4 диагональных градиента для строго ограниченного 2D-шума [-1, 1]
    static _grad2D(hash, x, y) {
        switch (hash & 3) {
            case 0: return  x + y;
            case 1: return -x + y;
            case 2: return  x - y;
            case 3: return -x - y;
        }
    }

    /**
     * Базовый 2D шум Перлина
     * @param {number} x 
     * @param {number} y 
     * @returns {number} Значение в диапазоне ~[-1, 1]
     */
    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);

        const u = PerlinNoise._fade(xf);
        const v = PerlinNoise._fade(yf);

        const aa = this.perm[this.perm[X] + Y];
        const ab = this.perm[this.perm[X] + Y + 1];
        const ba = this.perm[this.perm[X + 1] + Y];
        const bb = this.perm[this.perm[X + 1] + Y + 1];

        const g00 = PerlinNoise._grad2D(aa, xf, yf);
        const g10 = PerlinNoise._grad2D(ba, xf - 1, yf);
        const g01 = PerlinNoise._grad2D(ab, xf, yf - 1);
        const g11 = PerlinNoise._grad2D(bb, xf - 1, yf - 1);

        const x1 = PerlinNoise._lerp(g00, g10, u);
        const x2 = PerlinNoise._lerp(g01, g11, u);

        return PerlinNoise._lerp(x1, x2, v);
    }

    /**
     * Фрактальный многооктавный шум (Fractal Brownian Motion / FBM)
     * @param {number} x 
     * @param {number} y 
     * @param {{ octaves?: number, lacunarity?: number, persistence?: number, scale?: number }} options 
     * @returns {number} Нормализованное значение ~[-1, 1]
     */
    fbm2D(x, y, { octaves = 3, lacunarity = 2.0, persistence = 0.5, scale = 1.0 } = {}) {
        let total = 0;
        let freq = scale;
        let amp = 1.0;
        let maxAmp = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.noise2D(x * freq, y * freq) * amp;
            maxAmp += amp;
            freq *= lacunarity;
            amp *= persistence;
        }

        return maxAmp > 0 ? (total / maxAmp) : 0;
    }

    /**
     * Хребтовый шум (Ridge Noise) — инверсия абсолютного значения
     * Идеален для горных гряд, каньонов и узких гребней
     */
    ridge2D(x, y, options) {
        const val = this.fbm2D(x, y, options);
        return 1.0 - Math.abs(val);
    }

    /**
     * Вспученный шум (Billow Noise) — абсолютное значение
     */
    billow2D(x, y, options) {
        return Math.abs(this.fbm2D(x, y, options));
    }
}

// Экспорт глобального экземпляра движка
const perlinNoise = new PerlinNoise(4242);

if (typeof window !== 'undefined') {
    window.PerlinNoise = PerlinNoise;
    window.perlinNoise = perlinNoise;
}
if (typeof globalThis !== 'undefined') {
    globalThis.PerlinNoise = PerlinNoise;
    globalThis.perlinNoise = perlinNoise;
}
