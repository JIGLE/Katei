import { config } from '../config.js';

interface GraphitiSearchResponse {
  results?: unknown[];
  data?: unknown[];
}

export function graphitiEnabled(): boolean {
  return Boolean(config.graphitiUrl);
}

export function graphitiStatus(): { enabled: boolean; endpoint: string | null } {
  if (!config.graphitiUrl) return { enabled: false, endpoint: null };
  try {
    const url = new URL(config.graphitiUrl);
    return { enabled: true, endpoint: url.origin };
  } catch {
    return { enabled: true, endpoint: null };
  }
}

async function graphitiPost(path: string, payload: object): Promise<unknown> {
  if (!config.graphitiUrl) throw new Error('Graphiti is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.graphitiTimeoutMs);
  try {
    const res = await fetch(`${config.graphitiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.graphitiApiKey ? { Authorization: 'Bearer ' + config.graphitiApiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Graphiti request failed with ${res.status}`);
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(timeout);
  }
}

export async function recordGraphitiEpisode(opts: {
  type: string;
  title: string;
  actorId?: number | null;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!graphitiEnabled()) return;
  try {
    await graphitiPost('/episodes', {
      source: 'katei-backend',
      type: opts.type,
      title: opts.title,
      actor_id: opts.actorId ?? null,
      entity_id: opts.entityId ?? null,
      created_at: new Date().toISOString(),
      metadata: opts.metadata ?? {},
    });
  } catch {
    // Optional system: ingestion failures must never affect core flows.
  }
}

export async function queryGraphiti(query: string, limit = 5): Promise<{ results: unknown[] }> {
  const cleanLimit = Math.min(Math.max(limit || 5, 1), 20);
  const body = await graphitiPost('/search', { query, limit: cleanLimit });
  const response = (body ?? {}) as GraphitiSearchResponse;
  if (Array.isArray(response.results)) return { results: response.results };
  if (Array.isArray(response.data)) return { results: response.data };
  if (Array.isArray(body)) return { results: body };
  return { results: [] };
}
