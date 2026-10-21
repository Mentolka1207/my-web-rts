// =============================================================================
// js/prng.js — Детерминированный генератор псевдослучайных чисел (Mulberry32 PRNG)
// Обеспечивает 100% повторяемость симуляции (Lockstep, реплеи, бенчмарки)
// =============================================================================

class DeterministicPRNG {
    constructor(initialSeed = 1337) {
        this.initialSeed = initialSeed >>> 0;
        this.state = this.initialSeed;
    }

    // Установка нового сида (сброс последовательности)
    setSeed(seed) {
        this.initialSeed = seed >>> 0;
        this.state = this.initialSeed;
    }

    getSeed() {
        return this.initialSeed;
    }

    // Генерация случайного числа [0, 1) на базе алгоритма Mulberry32
    random() {
        let t = (this.state += 0x6D2B79F5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Случайное вещественное число в диапазоне [min, max)
    range(min, max) {
        return min + this.random() * (max - min);
    }

    // Случайное целое число в диапазоне [min, max]
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    }

    // Случайный выбор элемента из массива
    choice(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[this.int(0, arr.length - 1)];
    }
}

// Глобальный экземпляр генератора псевдослучайных чисел движка
const rtsPRNG = new DeterministicPRNG(4242);
