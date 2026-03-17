/**
 * examples/basic.ts
 * Shows manual recording and session-based cost tracking.
 *
 * Run: npx ts-node examples/basic.ts
 */

import { CostTracker, printSummary, toCSV } from '../src/index';

const tracker = new CostTracker({
  defaultSessionId: 'demo',
  budgetAlertUsd: 0.01,
  onBudgetExceeded: (sessionId, total, budget) => {
    console.warn(`⚠️  Session "${sessionId}" exceeded budget: $${total.toFixed(6)} > $${budget}`);
  },
});

// Simulate several API calls
tracker.record({ model: 'gpt-4o-mini', inputTokens: 1_200, outputTokens: 340,  latencyMs: 820  });
tracker.record({ model: 'gpt-4o-mini', inputTokens: 3_000, outputTokens: 800,  latencyMs: 1100 });
tracker.record({ model: 'gpt-4o',      inputTokens: 8_000, outputTokens: 2000, latencyMs: 2400 });
tracker.record({ model: 'gpt-4o',      inputTokens: 1_000, outputTokens: 500,  latencyMs: 950,
  sessionId: 'user-123', tags: ['feature:chat', 'env:prod'] });
tracker.record({ model: 'text-embedding-3-small', inputTokens: 50_000, outputTokens: 0 });

printSummary(tracker);
printSummary(tracker, 'user-123');

// Export CSV
const csv = toCSV(tracker);
console.log('CSV preview (first 3 lines):');
console.log(csv.split('\n').slice(0, 3).join('\n'));
