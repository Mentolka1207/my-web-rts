// scripts/ci-summary.js — сводка тестов для GitHub Actions (T-18).
// Числа берутся из JSON-отчётов текущего прогона, а не из README:
//   node scripts/ci-summary.js vitest vitest-results.json
//   node scripts/ci-summary.js e2e e2e/results.json
// В CI строка дописывается в $GITHUB_STEP_SUMMARY (страница прогона), локально — печатается в stdout.
// Нет отчёта — так и пишем: «отчёт не создан», без выдуманных чисел.

const fs = require('node:fs');

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.round(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${s} с`;
}

// Vitest --reporter=json (формат, совместимый с Jest)
function summarizeVitest(report) {
    const ends = (report.testResults || []).map(r => r.endTime).filter(Number.isFinite);
    const duration = ends.length && Number.isFinite(report.startTime) ? Math.max(...ends) - report.startTime : NaN;
    return {
        passed: report.numPassedTests || 0,
        failed: report.numFailedTests || 0,
        flaky: 0,
        skipped: (report.numPendingTests || 0) + (report.numTodoTests || 0),
        total: report.numTotalTests || 0,
        duration,
        errors: report.success === false && !report.numFailedTests ? 1 : 0
    };
}

// Playwright json-репортер: stats.expected — прошли, unexpected — упали, flaky — прошли со второй попытки
function summarizePlaywright(report) {
    const st = report.stats || {};
    const passed = st.expected || 0;
    const failed = st.unexpected || 0;
    const flaky = st.flaky || 0;
    const skipped = st.skipped || 0;
    return {
        passed, failed, flaky, skipped,
        total: passed + failed + flaky + skipped,
        duration: st.duration,
        // Ошибки вне тестов: globalTimeout, падение webServer и т. п.
        errors: (report.errors || []).length
    };
}

function formatRow(label, s) {
    const ok = s.failed === 0 && s.errors === 0;
    return `| ${label} | ${ok ? '✅' : '❌'} | ${s.passed} | ${s.failed} | ${s.flaky} | ${s.skipped} | ${s.errors} | ${formatDuration(s.duration)} |`;
}

const HEADER = '| Набор | Итог | Прошли | Упали | Flaky | Пропущены | Ошибки вне тестов | Время |\n|---|---|---|---|---|---|---|---|';

function buildSummary(kind, file, readFile = (p) => fs.readFileSync(p, 'utf8')) {
    const label = kind === 'vitest' ? 'Vitest (unit)' : 'Playwright (e2e)';
    let raw;
    try {
        raw = readFile(file);
    } catch {
        return `| ${label} | ❌ | отчёт \`${file}\` не создан | | | | | |`;
    }
    const report = JSON.parse(raw);
    const s = kind === 'vitest' ? summarizeVitest(report) : summarizePlaywright(report);
    return formatRow(label, s);
}

if (require.main === module) {
    const [kind, file] = process.argv.slice(2);
    if (!['vitest', 'e2e'].includes(kind) || !file) {
        console.error('usage: node scripts/ci-summary.js <vitest|e2e> <report.json>');
        process.exit(2);
    }
    const out = process.env.GITHUB_STEP_SUMMARY;
    const text = `### Тесты: ${kind === 'vitest' ? 'unit' : 'e2e'}\n\n${HEADER}\n${buildSummary(kind, file)}\n`;
    if (out) fs.appendFileSync(out, text + '\n');
    else process.stdout.write(text);
}

module.exports = { summarizeVitest, summarizePlaywright, buildSummary, formatDuration };
