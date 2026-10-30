// =============================================================================
// tests/geometry.test.js — Тесты объединения статической геометрии мешей
// =============================================================================

import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function createGeometryContext() {
    const ctx = vm.createContext({
        console,
        Math,
        window: { innerWidth: 1024, innerHeight: 768, addEventListener() {} },
        document: {
            getElementById: () => null
        }
    });

    // Load Three.js
    vm.runInContext(
        fs.readFileSync(path.join(ROOT, 'libs', 'three.min.js'), 'utf8') + '; this.THREE = THREE;',
        ctx
    );

    // Load scene.js
    const sceneCode = fs.readFileSync(path.join(ROOT, 'js', 'scene.js'), 'utf8');
    vm.runInContext(sceneCode, ctx);

    return ctx;
}

describe('Static Geometry Merging (mergeBufferGeometries)', () => {
    it('returns empty BufferGeometry on empty or invalid input', () => {
        const ctx = createGeometryContext();
        const res = vm.runInContext(`({
            empty: mergeBufferGeometries([]).attributes,
            nullInput: mergeBufferGeometries(null).attributes
        })`, ctx);

        expect(res.empty.position).toBeUndefined();
        expect(res.nullInput.position).toBeUndefined();
    });

    it('clones single geometry when no matrix is provided', () => {
        const ctx = createGeometryContext();
        const res = vm.runInContext(`
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const merged = mergeBufferGeometries([geo]);
            ({
                verts: merged.attributes.position.count,
                indices: merged.index.count,
                isSameRef: merged === geo
            })
        `, ctx);

        expect(res.verts).toBe(24);
        expect(res.indices).toBe(36);
        expect(res.isSameRef).toBe(false);
    });

    it('merges indexed geometries with correct vertex offset and indices', () => {
        const ctx = createGeometryContext();
        const res = vm.runInContext(`
            const b1 = new THREE.BoxGeometry(1, 1, 1);
            const b2 = new THREE.BoxGeometry(2, 2, 2);
            const m = new THREE.Matrix4().makeTranslation(10, 0, 0);
            const merged = mergeBufferGeometries([b1, { geometry: b2, matrix: m }]);
            ({
                verts: merged.attributes.position.count,
                indices: merged.index.count,
                hasNormals: !!merged.attributes.normal,
                hasUv: !!merged.attributes.uv
            })
        `, ctx);

        expect(res.verts).toBe(48); // 24 * 2
        expect(res.indices).toBe(72); // 36 * 2
        expect(res.hasNormals).toBe(true);
        expect(res.hasUv).toBe(true);
    });

    it('merges non-indexed geometries correctly', () => {
        const ctx = createGeometryContext();
        const res = vm.runInContext(`
            const o1 = new THREE.OctahedronGeometry(1);
            const o2 = new THREE.OctahedronGeometry(2);
            const merged = mergeBufferGeometries([o1, o2]);
            ({
                verts: merged.attributes.position.count,
                indexed: !!merged.index
            })
        `, ctx);

        expect(res.verts).toBe(48); // 24 * 2
        expect(res.indexed).toBe(false);
    });

    it('applies transformation matrix to vertex positions and normals', () => {
        const ctx = createGeometryContext();
        const res = vm.runInContext(`
            const b = new THREE.BoxGeometry(1, 1, 1);
            const m = new THREE.Matrix4().makeTranslation(5, 7, 9);
            const merged = mergeBufferGeometries([{ geometry: b, matrix: m }]);
            const arr = Array.from(merged.attributes.position.array);
            let minX = Infinity, maxX = -Infinity;
            for (let i = 0; i < arr.length; i += 3) {
                if (arr[i] < minX) minX = arr[i];
                if (arr[i] > maxX) maxX = arr[i];
            }
            ({ minX, maxX })
        `, ctx);

        expect(res.minX).toBeCloseTo(4.5, 3);
        expect(res.maxX).toBeCloseTo(5.5, 3);
    });

    it('handles mixed indexed and non-indexed geometries by normalizing to non-indexed', () => {
        const ctx = createGeometryContext();
        const res = vm.runInContext(`
            const b = new THREE.BoxGeometry(1, 1, 1); // 36 index count
            const o = new THREE.OctahedronGeometry(1); // 24 non-indexed verts
            const merged = mergeBufferGeometries([b, o]);
            ({
                verts: merged.attributes.position.count,
                indexed: !!merged.index
            })
        `, ctx);

        // Box non-indexed is 36 vertices + Octahedron 24 vertices = 60 vertices
        expect(res.verts).toBe(60);
        expect(res.indexed).toBe(false);
    });
});
