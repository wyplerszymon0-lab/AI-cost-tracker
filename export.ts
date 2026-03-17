/**
 * export.ts
 * Export tracker data to JSON or CSV.
 */

import { CostTracker, RequestRecord, AggregatedStats } from './tracker';

// ── JSON ─────────────────────────────────────────────────────────────────────

export interface JsonExport {
  exportedAt: string;
  summary: AggregatedStats;
  records: RequestRecord[];
}

export function toJSON(tracker: CostTracker, sessionId?: string): string {
  const records = tracker.getRecords(sessionId);
  const summary = sessionId
    ? tracker.getSessionStats(sessionId)
    : tracker.getAllStats();

  const data: JsonExport = {
    exportedAt: new Date().toISOString(),
    summary,
    records,
  };

  return JSON.stringify(data, null, 2);
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const CSV_COLUMNS: Array<keyof RequestRecord> = [
  'id',
  'timestamp',
  'model',
  'sessionId',
  'inputTokens',
  'outputTokens',
  'cachedTokens',
  'totalTokens',
  'costUsd',
  'latencyMs',
];

function escapeCSV(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(tracker: CostTracker, sessionId?: string): string {
  const records = tracker.getRecords(sessionId);
  const header = [...CSV_COLUMNS, 'tags'].join(',');

  const rows = records.map((r) => {
    const base = CSV_COLUMNS.map((col) => escapeCSV(r[col])).join(',');
    const tags = escapeCSV(r.tags.join('|'));
    return `${base},${tags}`;
  });

  return [header, ...rows].join('\n');
}

// ── Console summary ──────────────────────────────────────────────────────────

function fmt(n: number, decimals = 6): string {
  return n.toFixed(decimals);
}

export function printSummary(tracker: CostTracker, sessionId?: string): void {
  const stats = sessionId
    ? tracker.getSessionStats(sessionId)
    : tracker.getAllStats();

  const label = sessionId ? `Session: ${sessionId}` : 'All sessions';

  console.log(`\n${'─'.repeat(52)}`);
  console.log(` 💰 AI Cost Summary — ${label}`);
  console.log(`${'─'.repeat(52)}`);
  console.log(` Requests       : ${stats.requestCount}`);
  console.log(` Input tokens   : ${stats.inputTokens.toLocaleString()}`);
  console.log(` Output tokens  : ${stats.outputTokens.toLocaleString()}`);
  console.log(` Cached tokens  : ${stats.cachedTokens.toLocaleString()}`);
  console.log(` Total cost     : $${fmt(stats.totalCostUsd, 6)}`);
  console.log(` Avg/request    : $${fmt(stats.avgCostPerRequest, 6)}`);
  if (stats.avgLatencyMs !== null) {
    console.log(` Avg latency    : ${stats.avgLatencyMs.toFixed(0)}ms`);
  }

  if (Object.keys(stats.byModel).length > 0) {
    console.log(`\n By model:`);
    for (const [model, data] of Object.entries(stats.byModel)) {
      console.log(`   ${model.padEnd(30)} ${data.requests} reqs  $${fmt(data.costUsd)}`);
    }
  }
  console.log(`${'─'.repeat(52)}\n`);
}
