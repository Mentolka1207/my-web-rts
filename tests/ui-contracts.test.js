// =============================================================================
// tests/ui-contracts.test.js — контракты интерфейса после сборки на дизайн-токенах
//  1. style.css использует только токены (без сырых цветов и размеров)
//  2. каждый var(--…) в style.css объявлен в design/tokens.css
//  3. Service Worker прекэширует все локальные файлы index.html, версия кэша = package.json
//  4. каждый ключ data-i18n / data-i18n-aria / data-i18n-title есть в RU и EN
// =============================================================================
import { describe, it, expect } from 'vitest';
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// CSS без комментариев и без строк @media (в условиях media-запросов переменные не работают)
function cssBody(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(l => !/^\s*@media/.test(l)).join('\n');
}

describe('style.css: только дизайн-токены', () => {
    const css = cssBody(read('style.css'));

    it('нет hex-цветов', () => {
        expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).toEqual([]);
    });

    it('нет rgb()/rgba()/hsl()', () => {
        expect(css.match(/\b(rgba?|hsla?)\(/g) || []).toEqual([]);
    });

    it('нет пиксельных значений, кроме волосяных линий 1px/2px', () => {
        const px = (css.match(/-?\d*\.?\d+px/g) || []).filter(v => !['1px', '2px', '-1px'].includes(v));
        expect(px).toEqual([]);
    });

    it('каждая var(--…) объявлена в design/tokens.css', () => {
        const tokens = read('design/tokens.css');
        const declared = new Set((tokens.match(/--[a-z0-9-]+(?=\s*:)/g) || []));
        const used = new Set((css.match(/var\((--[a-z0-9-]+)/g) || []).map(v => v.slice(4)));
        const missing = [...used].filter(v => !declared.has(v));
        expect(missing).toEqual([]);
    });
});

describe('Service Worker: прекэш и версия', () => {
    const sw = read('sw.js');
    const html = read('index.html');
    const pkg = JSON.parse(read('package.json'));

    it('имя кэша содержит версию из package.json', () => {
        const name = (sw.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1];
        expect(name).toBe(`tabhold-v${pkg.version}`);
    });

    it('все локальные <script src> и <link rel=stylesheet> из index.html есть в прекэше', () => {
        const assets = new Set((sw.match(/'\.\/[^']+'/g) || []).map(s => s.slice(3, -1)));
        const local = [
            ...[...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
            ...[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1])
        ].filter(u => !/^https?:/.test(u));
        const missing = local.filter(u => !assets.has(u));
        expect(missing).toEqual([]);
    });
});

describe('i18n: ключи разметки есть в обоих языках', () => {
    const src = read('js/i18n.js');
    const TRANSLATIONS = new Function(src.replace(/function t\([\s\S]*$/, '') + '; return TRANSLATIONS;')();
    const html = read('index.html');

    it('словари RU и EN содержат одинаковые ключи', () => {
        const ru = Object.keys(TRANSLATIONS.ru).sort();
        const en = Object.keys(TRANSLATIONS.en).sort();
        expect(ru.filter(k => !en.includes(k))).toEqual([]);
        expect(en.filter(k => !ru.includes(k))).toEqual([]);
    });

    it('каждый data-i18n* ключ в index.html переведён', () => {
        const keys = [...html.matchAll(/data-i18n(?:-aria|-title)?="([A-Z0-9_]+)"/g)].map(m => m[1]);
        expect(keys.length).toBeGreaterThan(50);
        const missing = [...new Set(keys)].filter(k => !(k in TRANSLATIONS.ru) || !(k in TRANSLATIONS.en));
        expect(missing).toEqual([]);
    });
});
