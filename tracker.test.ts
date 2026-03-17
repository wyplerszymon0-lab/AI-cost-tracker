/**
 * tests/tracker.test.ts
 * Pure unit tests — no OpenAI API key required.
 */

import assert from 'assert';
import { CostTracker } from '../src/tracker';
import { calculateCost, getPricing } from '../src/pricing';
import { toCSV, toJSON } from '../src/export';

// ── Pricing ──────────────────────────────────────────────────────────────────

function testKnownModelPricing() {
  const cost = calculateCost('gpt-4o-mini', 1_000_000, 0);
  assert.strictEqual(cost, 0.15); // exactly $0.15 per 1M input tokens
  console.log('✓ gpt-4o-mini input pricing correct');
}

function testOutputPricing() {
  const cost = calculateCost('gpt-4o-mini', 0, 1_000_000);
  assert.strictEqual(cost, 0.60);
  console.log('✓ gpt-4o-mini output pricing correct');
}

function testCachedTokensDiscount() {
  // 1M input, all cached → should use cachedPerMillion rate
  const full   = calculateCost('gpt-4o', 1_000_000, 0, 0);
  const cached = calculateCost('gpt-4o', 1_000_000, 0, 1_000_000);
  assert.ok(cached < full, 'Cached cost should be lower than full input cost');
  console.log(`✓ Cached tokens cheaper: $${full.toFixed(4)} → $${cached.toFixed(4)}`);
}

function testUnknownModelFallback() {
  // Should not throw
  const pricing = getPricing('gpt-99-super');
  assert.ok(pricing.inputPerMillion > 0);
  console.log('✓ Unknown model falls back gracefully');
}

function testDateSuffixStripping() {
  const a = getPricing('gpt-4o');
  const b = getPricing('gpt-4o-2024-11-20');
  assert.deepStrictEqual(a, b);
  console.log('✓ Date suffix stripped for pricing lookup');
}

// ── Tracker ──────────────────────────────────────────────────────────────────

function testRecordAndSum() {
  const tracker = new CostTracker();
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 500 });
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 2000, outputTokens: 300 });

  const stats = tracker.getAllStats();
  assert.strictEqual(stats.requestCount, 2);
  assert.strictEqual(stats.inputTokens, 3000);
  assert.ok(stats.totalCostUsd > 0);
  console.log(`✓ Tracker records sum: $${stats.totalCostUsd.toFixed(6)}`);
}

function testSessionIsolation() {
  const tracker = new CostTracker();
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 0, sessionId: 'A' });
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 5000, outputTokens: 0, sessionId: 'B' });

  const statsA = tracker.getSessionStats('A');
  const statsB = tracker.getSessionStats('B');

  assert.strictEqual(statsA.inputTokens, 1000);
  assert.strictEqual(statsB.inputTokens, 5000);
  assert.strictEqual(statsA.requestCount, 1);
  console.log('✓ Session stats are isolated');
}

function testTagFiltering() {
  const tracker = new CostTracker();
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 100, outputTokens: 0, tags: ['env:prod', 'feature:chat'] });
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 200, outputTokens: 0, tags: ['env:dev'] });
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 300, outputTokens: 0, tags: ['env:prod', 'feature:search'] });

  const prodChat = tracker.getTagStats('env:prod', 'feature:chat');
  assert.strictEqual(prodChat.requestCount, 1);
  assert.strictEqual(prodChat.inputTokens, 100);
  console.log('✓ Tag filtering (multi-tag AND) works');
}

function testByModelBreakdown() {
  const tracker = new CostTracker();
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 0 });
  tracker.record({ model: 'gpt-4o',      inputTokens: 1000, outputTokens: 0 });

  const stats = tracker.getAllStats();
  assert.ok('gpt-4o-mini' in stats.byModel);
  assert.ok('gpt-4o'      in stats.byModel);
  assert.ok(stats.byModel['gpt-4o'].costUsd > stats.byModel['gpt-4o-mini'].costUsd);
  console.log('✓ byModel breakdown shows gpt-4o more expensive than gpt-4o-mini');
}

function testBudgetAlert() {
  let alerted = false;
  const tracker = new CostTracker({
    budgetAlertUsd: 0.001,
    onBudgetExceeded: () => { alerted = true; },
  });

  // $0.15 / 1M * 10k = $0.0015 → exceeds $0.001
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 10_000, outputTokens: 0 });
  assert.ok(alerted, 'Budget alert should have fired');
  console.log('✓ Budget alert fires when threshold exceeded');
}

function testReset() {
  const tracker = new CostTracker();
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 0 });
  tracker.reset();
  assert.strictEqual(tracker.getAllStats().requestCount, 0);
  console.log('✓ reset() clears all records');
}

function testOnRecordHook() {
  const captured: string[] = [];
  const tracker = new CostTracker({
    onRecord: (r) => captured.push(r.model),
  });
  tracker.record({ model: 'gpt-4o',      inputTokens: 100, outputTokens: 0 });
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 100, outputTokens: 0 });
  assert.deepStrictEqual(captured, ['gpt-4o', 'gpt-4o-mini']);
  console.log('✓ onRecord hook fires for each record');
}

// ── Export ───────────────────────────────────────────────────────────────────

function testCSVExport() {
  const tracker = new CostTracker();
  tracker.record({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 200, tags: ['env:prod'] });
  const csv = toCSV(tracker);
  const lines = csv.split('\n');
  assert.ok(lines[0].startsWith('id,timestamp,model'));
  assert.ok(lines[1].includes('gpt-4o-mini'));
  assert.ok(lines[1].includes('env:prod'));
  console.log('✓ CSV export contains correct headers and row');
}

function testJSONExport() {
  const tracker = new CostTracker();
  tracker.record({ model: 'gpt-4o', inputTokens: 500, outputTokens: 100 });
  const json = toJSON(tracker);
  const data = JSON.parse(json);
  assert.ok('summary' in data);
  assert.ok('records' in data);
  assert.strictEqual(data.records.length, 1);
  console.log('✓ JSON export has correct structure');
}

// ── Run all ──────────────────────────────────────────────────────────────────

const tests = [
  testKnownModelPricing,
  testOutputPricing,
  testCachedTokensDiscount,
  testUnknownModelFallback,
  testDateSuffixStripping,
  testRecordAndSum,
  testSessionIsolation,
  testTagFiltering,
  testByModelBreakdown,
  testBudgetAlert,
  testReset,
  testOnRecordHook,
  testCSVExport,
  testJSONExport,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
  } catch (err: any) {
    console.error(`\n❌ ${test.name} failed: ${err.message}`);
    failed++;
  }
}

if (failed === 0) {
  console.log(`\n✅ All ${tests.length} tests passed`);
} else {
  console.error(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
