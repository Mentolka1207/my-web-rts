// =============================================================================
// tests/audio.test.js — Звуковой движок на заглушке Web Audio API:
// громкости из настроек при создании контекста, перезапуск эмбиента, биения (LFO),
// молчание в скрытой вкладке.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

class FakeParam {
    constructor(owner, name) { this.owner = owner; this.name = name; this.value = 1; this.inputs = []; }
    setValueAtTime(v) { this.value = v; return this; }
    setTargetAtTime(v) { this.value = v; return this; }
    linearRampToValueAtTime(v) { this.value = v; return this; }
    exponentialRampToValueAtTime(v) { this.value = v; return this; }
    cancelScheduledValues() { return this; }
}

class FakeNode {
    constructor(kind) {
        this.kind = kind;
        this.outputs = [];
        this.started = false;
        this.stopped = false;
        this.disconnected = false;
        for (const p of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release', 'detune']) {
            this[p] = new FakeParam(this, p);
        }
    }
    connect(target) { this.outputs.push(target); if (target instanceof FakeParam) target.inputs.push(this); return target; }
    disconnect() { this.disconnected = true; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
    addEventListener() {}
}

class FakeAudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = new FakeNode('destination'); }
    createGain() { return new FakeNode('gain'); }
    createOscillator() { return new FakeNode('osc'); }
    createBiquadFilter() { return new FakeNode('filter'); }
    createDynamicsCompressor() { return new FakeNode('compressor'); }
    createBuffer(ch, size) { return { getChannelData: () => new Float32Array(size) }; }
    createBufferSource() { return new FakeNode('source'); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

function loadAudio() {
    const documentListeners = {};
    const ctx = vm.createContext({
        console, performance, Math, Promise,
        setTimeout, clearTimeout, setInterval, clearInterval,
        window: { AudioContext: FakeAudioContext, addEventListener() {}, removeEventListener() {} },
        document: {
            hidden: false,
            getElementById: () => null,
            addEventListener(type, fn) { documentListeners[type] = fn; }
        }
    });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'audio.js'), 'utf8'), ctx, { filename: 'js/audio.js' });
    const soundEngine = vm.runInContext('soundEngine', ctx);
    return { soundEngine, documentListeners, document: ctx.document };
}

let audio;
beforeEach(() => {
    vi.useFakeTimers();
    audio = loadAudio();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('BUG-022: громкость из настроек действует с первого звука', () => {
    it('шины создаются с громкостями, заданными до появления контекста', () => {
        const { soundEngine } = audio;
        // так делает loadSettingsFromStorage() при загрузке страницы: контекста ещё нет
        soundEngine.setMasterVolume(0.2);
        soundEngine.setSfxVolume(0.5);
        soundEngine.setMusicVolume(0);

        soundEngine.ensureContext(); // первый жест пользователя

        expect(soundEngine.masterGain.gain.value).toBeCloseTo(0.2 * 0.85, 9);
        expect(soundEngine.sfxGain.gain.value).toBeCloseTo(0.5 * 0.8, 9);
        expect(soundEngine.musicGain.gain.value).toBe(0);
    });

    it('без сохранённых настроек громкость полная', () => {
        const { soundEngine } = audio;

        soundEngine.ensureContext();

        expect(soundEngine.masterGain.gain.value).toBeCloseTo(0.85, 9);
        expect(soundEngine.sfxGain.gain.value).toBeCloseTo(0.8, 9);
        expect(soundEngine.musicGain.gain.value).toBeCloseTo(0.28, 9);
    });
});

describe('BUG-023: эмбиент', () => {
    it('перезапуск сразу после остановки не глушит новые осцилляторы', () => {
        const { soundEngine } = audio;
        soundEngine.startAmbient();
        const oldNodes = soundEngine.ambientNodes.slice();

        soundEngine.stopAmbient();   // итог боя
        soundEngine.startAmbient();  // «Играть снова» раньше, чем через 2 секунды
        const newNodes = soundEngine.ambientNodes.slice();
        vi.advanceTimersByTime(2500);

        expect(newNodes).toHaveLength(4);
        expect(soundEngine.ambientNodes).toHaveLength(4);
        expect(newNodes.every(n => n.osc.started && !n.osc.stopped && !n.lfo.stopped)).toBe(true);
        // прежние осцилляторы остановлены, а не оставлены работать вечно
        expect(oldNodes.every(n => n.osc.stopped && n.lfo.stopped)).toBe(true);
    });

    it('остановка без перезапуска останавливает осцилляторы', () => {
        const { soundEngine } = audio;
        soundEngine.startAmbient();
        const nodes = soundEngine.ambientNodes.slice();

        soundEngine.stopAmbient();
        vi.advanceTimersByTime(2500);

        expect(nodes.every(n => n.osc.stopped && n.lfo.stopped)).toBe(true);
        expect(soundEngine.ambientRunning).toBe(false);
    });

    it('LFO модулирует громкость своего тона (биения)', () => {
        const { soundEngine } = audio;
        soundEngine.startAmbient();

        for (const node of soundEngine.ambientNodes) {
            // цепочка: lfo → усилитель глубины → параметр gain тона
            const depth = node.lfo.outputs[0];
            expect(depth).toBeInstanceOf(FakeNode);
            expect(depth.outputs).toContain(node.gain.gain);
        }
    });
});

describe('скрытая вкладка не звучит', () => {
    it('контекст приостанавливается при скрытии и продолжается при возврате', () => {
        const { soundEngine, documentListeners, document } = audio;
        soundEngine.ensureContext();

        document.hidden = true;
        documentListeners.visibilitychange();
        expect(soundEngine.ctx.state).toBe('suspended');

        // звук из симуляции в скрытой вкладке контекст не будит
        soundEngine.ensureContext();
        expect(soundEngine.ctx.state).toBe('suspended');

        document.hidden = false;
        documentListeners.visibilitychange();
        expect(soundEngine.ctx.state).toBe('running');
    });
});
