/**
 * pricing.ts
 * Token pricing per model (USD per 1M tokens).
 * Prices as of 2025 — update this map as OpenAI adjusts pricing.
 */

export interface ModelPricing {
  inputPerMillion: number;   // USD per 1M input tokens
  outputPerMillion: number;  // USD per 1M output tokens
  cachedPerMillion?: number; // USD per 1M cached input tokens (if supported)
}

/** USD per 1M tokens */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-4o
  'gpt-4o':                { inputPerMillion: 2.50,  outputPerMillion: 10.00, cachedPerMillion: 1.25  },
  'gpt-4o-2024-11-20':     { inputPerMillion: 2.50,  outputPerMillion: 10.00, cachedPerMillion: 1.25  },
  'gpt-4o-2024-08-06':     { inputPerMillion: 2.50,  outputPerMillion: 10.00, cachedPerMillion: 1.25  },
  // GPT-4o mini
  'gpt-4o-mini':           { inputPerMillion: 0.15,  outputPerMillion: 0.60,  cachedPerMillion: 0.075 },
  'gpt-4o-mini-2024-07-18':{ inputPerMillion: 0.15,  outputPerMillion: 0.60,  cachedPerMillion: 0.075 },
  // o1
  'o1':                    { inputPerMillion: 15.00, outputPerMillion: 60.00, cachedPerMillion: 7.50  },
  'o1-mini':               { inputPerMillion: 1.10,  outputPerMillion: 4.40,  cachedPerMillion: 0.55  },
  'o1-preview':            { inputPerMillion: 15.00, outputPerMillion: 60.00 },
  // o3
  'o3-mini':               { inputPerMillion: 1.10,  outputPerMillion: 4.40,  cachedPerMillion: 0.55  },
  // GPT-4 Turbo
  'gpt-4-turbo':           { inputPerMillion: 10.00, outputPerMillion: 30.00 },
  'gpt-4-turbo-preview':   { inputPerMillion: 10.00, outputPerMillion: 30.00 },
  // GPT-3.5
  'gpt-3.5-turbo':         { inputPerMillion: 0.50,  outputPerMillion: 1.50  },
  // text-embedding
  'text-embedding-3-small':{ inputPerMillion: 0.02,  outputPerMillion: 0     },
  'text-embedding-3-large':{ inputPerMillion: 0.13,  outputPerMillion: 0     },
  'text-embedding-ada-002':{ inputPerMillion: 0.10,  outputPerMillion: 0     },
};

/**
 * Returns pricing for a model. Falls back to a conservative estimate
 * if the model isn't in the table (useful for new model releases).
 */
export function getPricing(model: string): ModelPricing {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // Fuzzy match: strip date suffixes like -2024-08-06
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  if (MODEL_PRICING[base]) return MODEL_PRICING[base];

  // Unknown model — return a warning pricing
  console.warn(`[ai-cost-tracker] Unknown model "${model}". Using fallback pricing.`);
  return { inputPerMillion: 10.00, outputPerMillion: 30.00 };
}

/**
 * Calculate USD cost for a single request.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
): number {
  const pricing = getPricing(model);
  const inputCost  = ((inputTokens - cachedTokens) / 1_000_000) * pricing.inputPerMillion;
  const cachedCost = (cachedTokens / 1_000_000) * (pricing.cachedPerMillion ?? pricing.inputPerMillion);
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + cachedCost + outputCost;
}
