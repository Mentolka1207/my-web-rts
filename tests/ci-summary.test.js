// T-18: сводка CI считает числа из отчётов прогона, а при отсутствии отчёта не выдумывает их.
import { describe, it, expect } from 'vitest';
const { summarizeVitest, summarizePlaywright, buildSummary, formatDuration } = require('../scripts/ci-summary.js');

describe('T-18: scripts/ci-summary.js', () => {
    it('Vitest: прошли / упали / пропущены и длительность из json-отчёта', () => {
        const s = summarizeVitest({
            numTotalTests: 10, numPassedTests: 8, numFailedTests: 1, numPendingTests: 1, numTodoTests: 0,
            startTime: 1000, success: false,
            testResults: [{ endTime: 3000 }, { endTime: 7500 }]
        });
        expect(s).toMatchObject({ passed: 8, failed: 1, skipped: 1, total: 10, duration: 6500, errors: 0 });
    });

    it('Playwright: flaky считаются отдельно, ошибки вне тестов (globalTimeout) учитываются', () => {
        const s = summarizePlaywright({
            stats: { expected: 37, unexpected: 1, flaky: 1, skipped: 0, duration: 1_182_000 },
            errors: [{ message: 'Timed out waiting 2400s for the test suite to run' }]
        });
        expect(s).toMatchObject({ passed: 37, failed: 1, flaky: 1, total: 39, errors: 1 });
    });

    it('строка таблицы: ❌ при падениях или ошибках, ✅ только при чистом прогоне', () => {
        const ok = JSON.stringify({ stats: { expected: 39, unexpected: 0, flaky: 0, skipped: 0, duration: 1_182_000 } });
        const bad = JSON.stringify({ stats: { expected: 39, unexpected: 0, flaky: 0, skipped: 0, duration: 5 }, errors: [{}] });
        expect(buildSummary('e2e', 'r.json', () => ok)).toBe('| Playwright (e2e) | ✅ | 39 | 0 | 0 | 0 | 0 | 19 мин 42 с |');
        expect(buildSummary('e2e', 'r.json', () => bad)).toMatch(/^\| Playwright \(e2e\) \| ❌ /);
    });

    it('нет отчёта — строка «отчёт не создан», без чисел', () => {
        const row = buildSummary('vitest', 'vitest-results.json', () => { throw new Error('ENOENT'); });
        expect(row).toBe('| Vitest (unit) | ❌ | отчёт `vitest-results.json` не создан | | | | | |');
    });

    it('formatDuration: секунды, минуты и неизвестная длительность', () => {
        expect(formatDuration(6_400)).toBe('6 с');
        expect(formatDuration(1_182_000)).toBe('19 мин 42 с');
        expect(formatDuration(NaN)).toBe('—');
    });
});
