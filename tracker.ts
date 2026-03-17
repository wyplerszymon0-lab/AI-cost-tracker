/**
 * tracker.ts
 * Records per-request usage and aggregates costs by session, model, and tag.
 */

import { calculateCost } from './pricing';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RequestRecord {
  id: string;
  timestamp: number;       // Unix ms
  model: string;
  sessionId: string;
  tags: string[];          // arbitrary labels e.g. ['feature:chat', 'env:prod']

  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;

  costUsd: number;
  latencyMs?: number;

  metadata?: Record<string, unknown>;
}

export interface AggregatedStats {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerRequest: number;
  avgLatencyMs: number | null;
  byModel: Record<string, { requests: number; tokens: number; costUsd: number }>;
}

export interface TrackerOptions {
  defaultSessionId?: string;
  onRecord?: (record: RequestRecord) => void;   // hook for streaming to external store
  budgetAlertUsd?: number;                       // emit warning when session exceeds this
  onBudgetExceeded?: (sessionId: string, total: number, budget: number) => void;
}

// ── Tracker class ────────────────────────────────────────────────────────────

export class CostTracker {
  private _records: RequestRecord[] = [];
  private _idCounter = 0;
  private _options: TrackerOptions;

  constructor(options: TrackerOptions = {}) {
    this._options = options;
  }

  // ------------------------------------------------------------------
  // Recording
  // ------------------------------------------------------------------

  /**
   * Record a completed API request.
   */
  record(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    sessionId?: string;
    tags?: string[];
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): RequestRecord {
    const {
      model,
      inputTokens,
      outputTokens,
      cachedTokens = 0,
      sessionId = this._options.defaultSessionId ?? 'default',
      tags = [],
      latencyMs,
      metadata,
    } = params;

    const costUsd = calculateCost(model, inputTokens, outputTokens, cachedTokens);

    const rec: RequestRecord = {
      id: `req_${Date.now()}_${++this._idCounter}`,
      timestamp: Date.now(),
      model,
      sessionId,
      tags,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd,
      latencyMs,
      metadata,
    };

    this._records.push(rec);
    this._options.onRecord?.(rec);

    // Budget alert
    if (this._options.budgetAlertUsd !== undefined && this._options.onBudgetExceeded) {
      const sessionTotal = this.getSessionStats(sessionId).totalCostUsd;
      if (sessionTotal >= this._options.budgetAlertUsd) {
        this._options.onBudgetExceeded(sessionId, sessionTotal, this._options.budgetAlertUsd);
      }
    }

    return rec;
  }

  // ------------------------------------------------------------------
  // Aggregation
  // ------------------------------------------------------------------

  private _aggregate(records: RequestRecord[]): AggregatedStats {
    const byModel: AggregatedStats['byModel'] = {};

    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let totalCostUsd = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const r of records) {
      inputTokens   += r.inputTokens;
      outputTokens  += r.outputTokens;
      cachedTokens  += r.cachedTokens;
      totalCostUsd  += r.costUsd;

      if (r.latencyMs !== undefined) {
        totalLatency += r.latencyMs;
        latencyCount++;
      }

      if (!byModel[r.model]) {
        byModel[r.model] = { requests: 0, tokens: 0, costUsd: 0 };
      }
      byModel[r.model].requests++;
      byModel[r.model].tokens    += r.totalTokens;
      byModel[r.model].costUsd   += r.costUsd;
    }

    return {
      requestCount: records.length,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens,
      totalCostUsd,
      avgCostPerRequest: records.length ? totalCostUsd / records.length : 0,
      avgLatencyMs: latencyCount ? totalLatency / latencyCount : null,
      byModel,
    };
  }

  /** Stats for all recorded requests. */
  getAllStats(): AggregatedStats {
    return this._aggregate(this._records);
  }

  /** Stats filtered to a specific session. */
  getSessionStats(sessionId: string): AggregatedStats {
    return this._aggregate(this._records.filter(r => r.sessionId === sessionId));
  }

  /** Stats filtered by tag (a record matches if it has ALL given tags). */
  getTagStats(...tags: string[]): AggregatedStats {
    return this._aggregate(
      this._records.filter(r => tags.every(t => r.tags.includes(t)))
    );
  }

  /** Stats for a time range [fromMs, toMs). */
  getTimeRangeStats(fromMs: number, toMs: number = Date.now()): AggregatedStats {
    return this._aggregate(this._records.filter(r => r.timestamp >= fromMs && r.timestamp < toMs));
  }

  // ------------------------------------------------------------------
  // Access
  // ------------------------------------------------------------------

  /** Returns all raw records (optionally filtered by sessionId). */
  getRecords(sessionId?: string): RequestRecord[] {
    return sessionId
      ? this._records.filter(r => r.sessionId === sessionId)
      : [...this._records];
  }

  /** Unique session IDs seen so far. */
  getSessions(): string[] {
    return [...new Set(this._records.map(r => r.sessionId))];
  }

  /** Clear all records. */
  reset(): void {
    this._records = [];
    this._idCounter = 0;
  }
}
