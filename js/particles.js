// =============================================================================
// js/particles.js — Пул частиц на одном THREE.Points (искры попаданий и обломки взрывов)
// Один draw call, фиксированные typed arrays, ноль аллокаций в игровом цикле.
// Живые частицы всегда лежат в слотах [0, count): при гибели частица заменяется
// последней живой (swap-remove), поэтому спавн и удаление выполняются за O(1).
// =============================================================================

const MAX_PARTICLES = 512;
const PARTICLE_GRAVITY = 9.0;

// Палитры (RGB 0..1), выбираются случайно при спавне
const PARTICLE_PALETTES = {
    fire:  [[1.0, 0.67, 0.0], [1.0, 0.4, 0.0], [1.0, 0.8, 0.2], [1.0, 0.2, 0.0]],
    ally:  [[0.0, 1.0, 0.8], [0.6, 1.0, 0.95], [1.0, 1.0, 1.0]],
    enemy: [[1.0, 0.2, 0.2], [1.0, 0.5, 0.2], [1.0, 0.85, 0.6]]
};

const particleSystem = {
    count: 0,
    points: null,
    // Атрибуты геометрии (GPU)
    _pos: new Float32Array(MAX_PARTICLES * 3),
    _col: new Float32Array(MAX_PARTICLES * 3),
    _size: new Float32Array(MAX_PARTICLES),
    // Состояние симуляции (CPU)
    _vel: new Float32Array(MAX_PARTICLES * 3),
    _baseCol: new Float32Array(MAX_PARTICLES * 3),
    _baseSize: new Float32Array(MAX_PARTICLES),
    _age: new Float32Array(MAX_PARTICLES),
    _life: new Float32Array(MAX_PARTICLES),
    _drag: new Float32Array(MAX_PARTICLES),
    _gravity: new Float32Array(MAX_PARTICLES),
    _uniforms: { uScale: { value: 1 } },

    init(targetScene) {
        const geo = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(this._pos, 3).setUsage(THREE.DynamicDrawUsage);
        const colAttr = new THREE.BufferAttribute(this._col, 3).setUsage(THREE.DynamicDrawUsage);
        const sizeAttr = new THREE.BufferAttribute(this._size, 1).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', posAttr);
        geo.setAttribute('aColor', colAttr);
        geo.setAttribute('aSize', sizeAttr);
        geo.setDrawRange(0, 0);

        // Мягкая круглая точка; затухание реализуется умножением цвета (аддитивное смешивание)
        const mat = new THREE.ShaderMaterial({
            uniforms: this._uniforms,
            vertexShader: [
                'attribute vec3 aColor;',
                'attribute float aSize;',
                'uniform float uScale;',
                'varying vec3 vColor;',
                'void main() {',
                '    vColor = aColor;',
                '    vec4 mv = modelViewMatrix * vec4(position, 1.0);',
                '    gl_PointSize = max(1.0, aSize * uScale / -mv.z);',
                '    gl_Position = projectionMatrix * mv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vColor;',
                'void main() {',
                '    float d = length(gl_PointCoord - vec2(0.5));',
                '    if (d > 0.5) discard;',
                '    float a = smoothstep(0.5, 0.05, d);',
                '    gl_FragColor = vec4(vColor * a, 1.0);',
                '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.points = new THREE.Points(geo, mat);
        this.points.frustumCulled = false; // bounding sphere не пересчитывается — отсечение отключено
        targetScene.add(this.points);
    },

    // Резервирует слот; возвращает индекс или -1, если пул заполнен (частица пропускается)
    _alloc() {
        return this.count < MAX_PARTICLES ? this.count++ : -1;
    },

    _emit(x, y, z, vx, vy, vz, life, size, palette, drag, gravity) {
        const i = this._alloc();
        if (i === -1) return;
        const c = palette[(Math.random() * palette.length) | 0];
        const i3 = i * 3;
        this._pos[i3] = x; this._pos[i3 + 1] = y; this._pos[i3 + 2] = z;
        this._vel[i3] = vx; this._vel[i3 + 1] = vy; this._vel[i3 + 2] = vz;
        this._baseCol[i3] = c[0]; this._baseCol[i3 + 1] = c[1]; this._baseCol[i3 + 2] = c[2];
        this._col[i3] = c[0]; this._col[i3 + 1] = c[1]; this._col[i3 + 2] = c[2];
        this._baseSize[i] = size;
        this._size[i] = size;
        this._age[i] = 0;
        this._life[i] = life;
        this._drag[i] = drag;
        this._gravity[i] = gravity;
    },

    // Искры попадания снаряда: короткий веер вверх от точки удара
    emitImpact(position, isAlly, count = 6) {
        const palette = isAlly ? PARTICLE_PALETTES.ally : PARTICLE_PALETTES.enemy;
        for (let n = 0; n < count; n++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 3.0;
            this._emit(
                position.x, position.y + 0.15, position.z,
                Math.cos(angle) * speed, 1.5 + Math.random() * 2.5, Math.sin(angle) * speed,
                0.18 + Math.random() * 0.18, 0.1 + Math.random() * 0.08,
                palette, 1.5, PARTICLE_GRAVITY
            );
        }
    },

    // Уничтожение юнита: обломки (быстрые, тяжёлые) + несколько крупных медленных огненных вспышек
    emitDestruction(position, count = 10) {
        for (let n = 0; n < count; n++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2.0 + Math.random() * 4.0;
            this._emit(
                position.x, position.y, position.z,
                Math.cos(angle) * speed, 3.0 + Math.random() * 3.5, Math.sin(angle) * speed,
                0.35 + Math.random() * 0.25, 0.14 + Math.random() * 0.14,
                PARTICLE_PALETTES.fire, 0.5, PARTICLE_GRAVITY
            );
        }
        const puffs = Math.max(2, count >> 2);
        for (let n = 0; n < puffs; n++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 1.5;
            this._emit(
                position.x, position.y + 0.2, position.z,
                Math.cos(angle) * speed, 0.5 + Math.random() * 1.5, Math.sin(angle) * speed,
                0.25 + Math.random() * 0.2, 0.7 + Math.random() * 0.5,
                PARTICLE_PALETTES.fire, 3.0, 0
            );
        }
    },

    update(delta) {
        // Масштаб точек: мировой диаметр -> пиксели буфера кадра на единичной глубине
        this._uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));

        const pos = this._pos, col = this._col, size = this._size, vel = this._vel;
        let i = 0;
        while (i < this.count) {
            const age = (this._age[i] += delta);
            const life = this._life[i];
            const i3 = i * 3;

            if (age >= life || pos[i3 + 1] < 0) {
                this._kill(i);
                continue; // в слот i перенесена последняя живая частица — обработать её
            }

            const damp = Math.max(0, 1 - this._drag[i] * delta);
            vel[i3] *= damp; vel[i3 + 2] *= damp;
            vel[i3 + 1] = vel[i3 + 1] * damp - this._gravity[i] * delta;
            pos[i3] += vel[i3] * delta;
            pos[i3 + 1] += vel[i3 + 1] * delta;
            pos[i3 + 2] += vel[i3 + 2] * delta;

            const fade = 1 - age / life;
            col[i3] = this._baseCol[i3] * fade;
            col[i3 + 1] = this._baseCol[i3 + 1] * fade;
            col[i3 + 2] = this._baseCol[i3 + 2] * fade;
            size[i] = this._baseSize[i] * (0.4 + 0.6 * fade);
            i++;
        }

        const geo = this.points.geometry;
        geo.setDrawRange(0, this.count);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aColor.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
    },

    // Swap-remove: последняя живая частица занимает освободившийся слот
    _kill(i) {
        const last = --this.count;
        if (i === last) return;
        const i3 = i * 3, l3 = last * 3;
        for (let k = 0; k < 3; k++) {
            this._pos[i3 + k] = this._pos[l3 + k];
            this._col[i3 + k] = this._col[l3 + k];
            this._vel[i3 + k] = this._vel[l3 + k];
            this._baseCol[i3 + k] = this._baseCol[l3 + k];
        }
        this._size[i] = this._size[last];
        this._baseSize[i] = this._baseSize[last];
        this._age[i] = this._age[last];
        this._life[i] = this._life[last];
        this._drag[i] = this._drag[last];
        this._gravity[i] = this._gravity[last];
    },

    clear() {
        this.count = 0;
        if (this.points) this.points.geometry.setDrawRange(0, 0);
    }
};

particleSystem.init(scene);
