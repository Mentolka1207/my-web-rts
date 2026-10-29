// =============================================================================
// js/audio.js — Процедурная звуковая подсистема (Web Audio API Synthesizer)
// 100% автономный процедурный синтез sci-fi звуков и космического эмбиента.
// Не требует внешних файлов (.mp3/.wav), работает оффлайн и без CORS по file:///.
// =============================================================================

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;

        this.isMuted = false;
        this.isMusicMuted = false;
        this.initialized = false;

        // Буфер белого шума для взрывов и гидромеханики
        this.noiseBuffer = null;

        // Состояние процедурного эмбиента
        this.ambientGain = null;
        this.ambientNodes = [];
        this.ambientTimer = null;
        this.ambientRunning = false;

        // Ограничение частоты воспроизведения однотипных звуков (лимитер перегруза)
        this.lastSoundTimes = {};

        // Телеметрия и замер времени расчёта Web Audio API за тик (HUD-профайлер)
        this.tickSynthesisTime = 0;
        this.lastTickSynthesisTime = 0;
        this.soundEventsThisTick = 0;
        this.activeVoices = 0;
    }

    resetTickStats() {
        this.lastTickSynthesisTime = this.tickSynthesisTime;
        this.tickSynthesisTime = 0;
        this.soundEventsThisTick = 0;
    }

    _trackVoice(node) {
        if (!node) return;
        this.activeVoices++;
        try {
            node.addEventListener('ended', () => {
                this.activeVoices = Math.max(0, this.activeVoices - 1);
            }, { once: true });
        } catch (_) {}
    }

    _runProfiled(fn) {
        const _t0 = performance.now();
        try {
            return fn();
        } finally {
            this.tickSynthesisTime += (performance.now() - _t0);
            this.soundEventsThisTick++;
        }
    }

    // Инициализация аудиоконтекста (вызывается по первому клику/действию пользователя)
    init() {
        if (this.initialized) {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        try {
            this.ctx = new AudioContextClass();

            // Мастер-компрессор динамического диапазона (предотвращение клиппинга и искажений при канонаде)
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
            this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
            this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
            this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
            this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
            this.compressor.connect(this.ctx.destination);

            // Мастер-шина
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
            this.masterGain.connect(this.compressor);

            // Шина звуковых эффектов (SFX)
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
            this.sfxGain.connect(this.masterGain);

            // Шина музыки и фонового эмбиента
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
            this.musicGain.connect(this.masterGain);

            // Предварительная генерация шума для взрывов (1.5 сек белого шума)
            const sampleRate = this.ctx.sampleRate || 44100;
            const bufferSize = sampleRate * 1.5;
            this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            // Лимитер максимального числа событий синтеза за тик
            this.maxSoundEventsPerTick = 18;

            this.initialized = true;
        } catch (e) {
            console.warn('[SoundEngine] Ошибка инициализации Web Audio API:', e);
            this.ctx = null;
        }
    }

    ensureContext() {
        if (!this.initialized) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    // Проверка лимита частоты запуска звука (не чаще раза в minInterval сек) и лимитера событий за тик
    canPlay(id, minInterval = 0.04) {
        if (!this.initialized || this.isMuted || !this.ctx) return false;
        if (this.soundEventsThisTick >= this.maxSoundEventsPerTick) return false;

        const now = this.ctx.currentTime;
        if (this.lastSoundTimes[id] && (now - this.lastSoundTimes[id] < minInterval)) {
            return false;
        }
        this.lastSoundTimes[id] = now;
        return true;
    }

    // Расчёт пространственного затухания звука в зависимости от расстояния до камеры
    getSpatialAttenuation(worldX, worldZ, maxDist = 45) {
        if (typeof camera === 'undefined' || worldX === undefined) return 1.0;
        const dx = camera.position.x - worldX;
        const dz = camera.position.z - worldZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= 10) return 1.0;
        if (dist >= maxDist) return 0.2;
        return 1.0 - ((dist - 10) / (maxDist - 10)) * 0.8;
    }

    // Управление раздельной громкостью
    setMasterVolume(val) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        if (this.masterGain && this.ctx && !this.isMuted) {
            this.masterGain.gain.setTargetAtTime(this.masterVolume * 0.85, this.ctx.currentTime, 0.03);
        }
    }

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        if (this.sfxGain && this.ctx) {
            this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.8, this.ctx.currentTime, 0.03);
        }
    }

    setMusicVolume(val) {
        this.musicVolume = Math.max(0, Math.min(1, val));
        if (this.musicGain && this.ctx) {
            this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.28, this.ctx.currentTime, 0.03);
        }
    }

    // Включение / выключение звука
    toggleMute() {
        this.ensureContext();
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            const target = this.isMuted ? 0 : (this.masterVolume !== undefined ? this.masterVolume * 0.85 : 0.85);
            this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
        }
        this.updateSoundUI();
        return !this.isMuted;
    }

    // Обновление иконки/текста кнопки звука
    updateSoundUI() {
        const btn = document.getElementById('sound-toggle-btn');
        if (btn) {
            const isRu = (typeof currentLanguage === 'undefined') || currentLanguage === 'ru';
            btn.textContent = this.isMuted ? (isRu ? '🔇 Звук: ВЫКЛ' : '🔇 Audio: OFF') : (isRu ? '🔊 Звук: ВКЛ' : '🔊 Audio: ON');
            btn.style.borderColor = this.isMuted ? '#ff5555' : '#00ffcc';
            btn.style.color = this.isMuted ? '#ff8888' : '#00ffcc';
            btn.style.boxShadow = this.isMuted ? 'none' : '0 0 10px rgba(0, 255, 204, 0.4)';
        }
    }

    // --- 1. ВЫСТРЕЛ ЛАЗЕРА (LASER SFX) ---
    playLaser(type = 'ally') {
        if (!this.canPlay('laser_' + type, type === 'boss' ? 0.08 : 0.04)) return;
        this.ensureContext();
        if (!this.ctx) return;
        return this._runProfiled(() => {
            const t = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            if (type === 'ally') {
                // Быстрый бирюзовый sci-fi импульс
                osc.type = 'sine';
                osc.frequency.setValueAtTime(820, t);
                osc.frequency.exponentialRampToValueAtTime(220, t + 0.08);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(2200, t);

                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxGain);

                this._trackVoice(osc);
                osc.start(t);
                osc.stop(t + 0.08);
            } else if (type === 'heavy') {
                // Мощный осадный выстрел танка
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(280, t);
                osc.frequency.exponentialRampToValueAtTime(50, t + 0.22);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1400, t);
                filter.frequency.exponentialRampToValueAtTime(200, t + 0.22);

                gain.gain.setValueAtTime(0.5, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

                // Саб-басовый толчок
                const sub = this.ctx.createOscillator();
                const subGain = this.ctx.createGain();
                sub.type = 'sine';
                sub.frequency.setValueAtTime(110, t);
                sub.frequency.exponentialRampToValueAtTime(30, t + 0.25);
                subGain.gain.setValueAtTime(0.6, t);
                subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                sub.connect(subGain);
                subGain.connect(this.sfxGain);
                this._trackVoice(sub);
                sub.start(t);
                sub.stop(t + 0.25);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxGain);

                this._trackVoice(osc);
                osc.start(t);
                osc.stop(t + 0.22);
            } else if (type === 'boss') {
                // Массивный залп флагмана-Левиафана
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(450, t);
                osc.frequency.exponentialRampToValueAtTime(70, t + 0.28);

                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(800, t);
                filter.Q.setValueAtTime(2.5, t);

                gain.gain.setValueAtTime(0.55, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxGain);

                this._trackVoice(osc);
                osc.start(t);
                osc.stop(t + 0.28);
            } else {
                // Вражеский штурмовой выстрел
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(580, t);
                osc.frequency.exponentialRampToValueAtTime(140, t + 0.09);

                gain.gain.setValueAtTime(0.32, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

                osc.connect(gain);
                gain.connect(this.sfxGain);

                this._trackVoice(osc);
                osc.start(t);
                osc.stop(t + 0.09);
            }
        });
    }

    // --- 2. ВСПЫШКА ПОПАДАНИЯ ИЛИ ЩИТ (HIT / SHIELD SFX) ---
    playHit(isShield = false) {
        if (!this.canPlay('hit', 0.03)) return;
        this.ensureContext();
        if (!this.ctx) return;
        return this._runProfiled(() => {
            const t = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            if (isShield) {
                // Резонансный звон щита
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1250, t);
                osc.frequency.exponentialRampToValueAtTime(950, t + 0.08);

                gain.gain.setValueAtTime(0.28, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            } else {
                // Металлический щелчок пробития брони
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, t);
                osc.frequency.exponentialRampToValueAtTime(80, t + 0.04);

                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            }

            osc.connect(gain);
            gain.connect(this.sfxGain);
            this._trackVoice(osc);
            osc.start(t);
            osc.stop(t + (isShield ? 0.08 : 0.04));
        });
    }

    // --- 3. ВЗРЫВ (EXPLOSION SFX) ---
    playExplosion(scale = 1.0) {
        if (!this.canPlay('explosion', 0.08)) return;
        this.ensureContext();
        if (!this.ctx || !this.noiseBuffer) return;

        return this._runProfiled(() => {
            const t = this.ctx.currentTime;
            const duration = Math.min(1.2, 0.45 * scale);

            // 1. Шумовой компонент взрыва (White Noise + Lowpass Filter Sweep)
            const noise = this.ctx.createBufferSource();
            noise.buffer = this.noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1000 * Math.min(scale, 1.5), t);
            filter.frequency.exponentialRampToValueAtTime(45, t + duration);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.65 * Math.min(scale, 1.4), t);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.sfxGain);

            this._trackVoice(noise);
            noise.start(t);
            noise.stop(t + duration);

            // 2. Глубокий суб-басовый удар
            const sub = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(95 * Math.max(0.6, 1 / scale), t);
            sub.frequency.exponentialRampToValueAtTime(25, t + duration * 0.9);

            subGain.gain.setValueAtTime(0.55 * Math.min(scale, 1.6), t);
            subGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.9);

            sub.connect(subGain);
            subGain.connect(this.sfxGain);

            this._trackVoice(sub);
            sub.start(t);
            sub.stop(t + duration * 0.9);
        });
    }

    // --- 4. ПРИКАЗ ПЕРЕМЕЩЕНИЯ ИЛИ АТАКИ (ORDER BEEP SFX) ---
    playOrder(isAttack = false) {
        if (!this.canPlay('order', 0.08)) return;
        this.ensureContext();
        if (!this.ctx) return;
        return this._runProfiled(() => {
            const t = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = isAttack ? 'sawtooth' : 'sine';

            osc.connect(gain);
            gain.connect(this.sfxGain);
            this._trackVoice(osc);
            osc.start(t);

            if (isAttack) {
                // Резкий двухтоновый боевой сигнал
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.setValueAtTime(660, t + 0.05);

                gain.gain.setValueAtTime(0.35, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                osc.stop(t + 0.12);
            } else {
                // Приятный восходящий sci-fi пинг
                osc.frequency.setValueAtTime(580, t);
                osc.frequency.exponentialRampToValueAtTime(880, t + 0.07);

                gain.gain.setValueAtTime(0.25, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.stop(t + 0.1);
            }
        });
    }

    // --- 5. ВЫДЕЛЕНИЕ ЮНИТОВ (SELECT CLICK SFX) ---
    playSelect() {
        if (!this.canPlay('select', 0.06)) return;
        this.ensureContext();
        if (!this.ctx) return;
        return this._runProfiled(() => {
            const t = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1600, t);
            osc.frequency.exponentialRampToValueAtTime(1100, t + 0.03);

            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            this._trackVoice(osc);
            osc.start(t);
            osc.stop(t + 0.03);
        });
    }

    // --- 6. ПРОИЗВОДСТВО ДРОНА (PRODUCE SFX) ---
    playProduce() {
        if (!this.canPlay('produce', 0.1)) return;
        this.ensureContext();
        if (!this.ctx) return;
        return this._runProfiled(() => {
            const t = this.ctx.currentTime;

            // Восходящее электронное трезвучие (C5 -> E5 -> G5)
            const notes = [523.25, 659.25, 783.99];
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const noteStart = t + idx * 0.045;

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, noteStart);

                gain.gain.setValueAtTime(0.24, noteStart);
                gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.15);

                osc.connect(gain);
                gain.connect(this.sfxGain);
                this._trackVoice(osc);
                osc.start(noteStart);
                osc.stop(noteStart + 0.15);
            });
        });
    }

    // --- 7. ЗАХВАТ ИЛИ ПОТЕРЯ РЕСУРСНОЙ ТОЧКИ (CAPTURE SFX) ---
    playCapture(isPlayer = true) {
        if (!this.canPlay('capture', 0.2)) return;
        this.ensureContext();
        if (!this.ctx) return;
        return this._runProfiled(() => {
            const t = this.ctx.currentTime;

            const freqs = isPlayer ? [440, 554.37, 659.25, 880] : [659.25, 554.37, 440, 370];
            freqs.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const noteStart = t + idx * 0.07;

                osc.type = isPlayer ? 'sine' : 'sawtooth';
                osc.frequency.setValueAtTime(freq, noteStart);

                gain.gain.setValueAtTime(isPlayer ? 0.26 : 0.2, noteStart);
                gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.22);

                osc.connect(gain);
                gain.connect(this.sfxGain);
                this._trackVoice(osc);
                osc.start(noteStart);
                osc.stop(noteStart + 0.22);
            });
        });
    }

    // --- 8. ТАКТИЧЕСКИЕ СПОСОБНОСТИ (ABILITY SFX) ---
    playAbility(type) {
        this.ensureContext();
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        if (type === 'overdrive') {
            // Форсаж: свист ускоряющейся турбины (350Hz -> 1800Hz)
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, t);
            osc.frequency.exponentialRampToValueAtTime(1750, t + 0.35);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(900, t);
            filter.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
            filter.Q.setValueAtTime(3.0, t);

            gain.gain.setValueAtTime(0.38, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 0.38);
        } else if (type === 'shield') {
            // Щит: гул разворачиваемого энергокупола
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(110, t);
            osc.frequency.exponentialRampToValueAtTime(480, t + 0.28);

            gain.gain.setValueAtTime(0.45, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 0.35);
        } else if (type === 'siege') {
            // Осада: механический щелчок гидравлики
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(160, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);

            gain.gain.setValueAtTime(0.5, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 0.22);
        }
    }

    // --- 9. СИРЕНА ВОЛНЫ И БОССА (WAVE HORN SFX) ---
    playWave(isBoss = false) {
        this.ensureContext();
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';

        if (isBoss) {
            // Зловещий глубокий низкий рев Левиафана
            osc.frequency.setValueAtTime(65, t);
            osc.frequency.linearRampToValueAtTime(82, t + 0.4);
            osc.frequency.linearRampToValueAtTime(55, t + 0.9);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(380, t);

            gain.gain.setValueAtTime(0.6, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 1.2);
        } else {
            // Тактический сигнал тревоги о новой волне
            osc.frequency.setValueAtTime(220, t);
            osc.frequency.linearRampToValueAtTime(330, t + 0.25);
            osc.frequency.linearRampToValueAtTime(220, t + 0.5);

            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 0.55);
        }
    }

    // --- 10. ТАКТИЧЕСКОЕ ОПОВЕЩЕНИЕ (TACTICAL ALERT SFX) ---
    playAlert(isDanger = false) {
        if (!this.canPlay('alert', 0.3)) return;
        this.ensureContext();
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = isDanger ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(isDanger ? 720 : 880, t);
        osc.frequency.setValueAtTime(isDanger ? 620 : 980, t + 0.08);

        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    // --- 11. ПОБЕДА / ПОРАЖЕНИЕ (GAME OVER JINGLE) ---
    playGameOver(playerWon) {
        this.ensureContext();
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        if (playerWon) {
            // Триумфальный мажорный фанфар (C4, E4, G4, C5)
            const chord = [261.63, 329.63, 392.00, 523.25];
            chord.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, t);

                gain.gain.setValueAtTime(0.35, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);

                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t + idx * 0.08);
                osc.stop(t + 2.5);
            });
        } else {
            // Мрачный затухающий минорный дрон
            const chord = [130.81, 155.56, 196.00];
            chord.forEach((freq) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, t);

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(300, t);
                filter.frequency.exponentialRampToValueAtTime(50, t + 2.2);

                gain.gain.setValueAtTime(0.38, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t);
                osc.stop(t + 2.2);
            });
        }
    }

    // --- 12. ПРОЦЕДУРНЫЙ КОСМИЧЕСКИЙ ЭМБИЕНТ (SPACE DRONE) ---
    startAmbient() {
        if (this.ambientRunning) return;
        this.ensureContext();
        if (!this.ctx) return;
        this.ambientRunning = true;

        const t = this.ctx.currentTime;
        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(0.001, t);
        this.ambientGain.gain.linearRampToValueAtTime(0.24, t + 3.0); // плавное нарастание

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(260, t);

        this.ambientGain.connect(filter);
        filter.connect(this.musicGain);

        // Генерация низкочастотных тонов космического дрона
        const baseFrequencies = [55.0, 82.4, 110.0, 164.8]; // A1, E2, A2, E3
        this.ambientNodes = [];

        baseFrequencies.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 0.8, t);

            gain.gain.setValueAtTime(0.22, t);

            // Медленная модуляция громкости (биения)
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();
            lfo.frequency.setValueAtTime(0.08 + idx * 0.03, t);
            lfoGain.gain.setValueAtTime(0.08, t);
            lfo.connect(lfoGain.gain);

            osc.connect(gain);
            gain.connect(this.ambientGain);

            osc.start(t);
            lfo.start(t);

            this.ambientNodes.push({ osc, gain, lfo });
        });

        // Плавная смена тональности каждые 12 секунд (космический звуковой ландшафт)
        const chords = [
            [55.0, 82.4, 110.0],   // A
            [49.0, 73.4, 98.0],    // G
            [43.6, 65.4, 87.3],    // F
            [55.0, 82.4, 110.0]    // A
        ];
        let chordIdx = 0;

        this.ambientInterval = setInterval(() => {
            if (!this.ambientRunning || !this.ctx) return;
            chordIdx = (chordIdx + 1) % chords.length;
            const targetChord = chords[chordIdx];
            const now = this.ctx.currentTime;

            for (let i = 0; i < Math.min(targetChord.length, this.ambientNodes.length); i++) {
                const node = this.ambientNodes[i];
                node.osc.frequency.setTargetAtTime(targetChord[i], now, 4.0);
            }
        }, 12000);
    }

    stopAmbient() {
        if (!this.ambientRunning) return;
        this.ambientRunning = false;
        clearInterval(this.ambientInterval);

        if (this.ambientGain && this.ctx) {
            const t = this.ctx.currentTime;
            this.ambientGain.gain.setTargetAtTime(0.001, t, 1.5);
            setTimeout(() => {
                this.ambientNodes.forEach(n => {
                    try { n.osc.stop(); n.lfo.stop(); } catch (e) {}
                });
                this.ambientNodes.length = 0;
            }, 2000);
        }
    }
}

// Глобальный экземпляр аудиодвижка
const soundEngine = new SoundEngine();

// Удобные глобальные функции-обёртки
function toggleSound() {
    try { return soundEngine.toggleMute(); } catch (e) { console.warn(e); }
}

function playLaserSound(type) {
    try { soundEngine.playLaser(type); } catch (e) { console.warn(e); }
}

function playHitSound(isShield) {
    try { soundEngine.playHit(isShield); } catch (e) { console.warn(e); }
}

function playExplosionSound(scale) {
    try { soundEngine.playExplosion(scale); } catch (e) { console.warn(e); }
}

function playOrderSound(isAttack) {
    try { soundEngine.playOrder(isAttack); } catch (e) { console.warn(e); }
}

function playSelectSound() {
    try { soundEngine.playSelect(); } catch (e) { console.warn(e); }
}

function playProduceSound() {
    try { soundEngine.playProduce(); } catch (e) { console.warn(e); }
}

function playCaptureSound(isPlayer) {
    try { soundEngine.playCapture(isPlayer); } catch (e) { console.warn(e); }
}

function playAbilitySound(type) {
    try { soundEngine.playAbility(type); } catch (e) { console.warn(e); }
}

function playWaveSound(isBoss) {
    try { soundEngine.playWave(isBoss); } catch (e) { console.warn(e); }
}

function playAlertSound(isDanger) {
    try { soundEngine.playAlert(isDanger); } catch (e) { console.warn(e); }
}

function playGameOverSound(playerWon) {
    try { soundEngine.playGameOver(playerWon); } catch (e) { console.warn(e); }
}

// Автоматическая разблокировка аудиоконтекста по первому жесту пользователя
function unlockAudioContextOnUserGesture() {
    soundEngine.ensureContext();
    window.removeEventListener('click', unlockAudioContextOnUserGesture);
    window.removeEventListener('keydown', unlockAudioContextOnUserGesture);
    window.removeEventListener('touchstart', unlockAudioContextOnUserGesture);
}

window.addEventListener('click', unlockAudioContextOnUserGesture, { once: true });
window.addEventListener('keydown', unlockAudioContextOnUserGesture, { once: true });
window.addEventListener('touchstart', unlockAudioContextOnUserGesture, { once: true, passive: true });
