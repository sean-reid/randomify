import type { Env } from './env.js';

/** Serious failure modes worth paging on. Routine outcomes (a track with no
 * preview, a bad id) are deliberately excluded. */
export type AlertMode =
  | 'preview_quota' // Deezer throttling us (body error code 4)
  | 'preview_upstream' // Deezer 5xx / gateway error
  | 'preview_threw' // the preview fetch threw
  | 'spin_unavailable' // /spin could not reach the corpus
  | 'health_db'; // /health DB ping failed

const WINDOW_MS = 10 * 60 * 1000;

/** Best-effort ntfy push (high priority). No-op without a topic; never throws. */
export async function pushNtfy(env: Env, title: string, message: string): Promise<void> {
  if (!env.NTFY_TOPIC) return;
  try {
    await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
      method: 'POST',
      headers: { Title: title, Priority: 'high', Tags: 'rotating_light' },
      body: message,
    });
  } catch {
    // Alerting is best-effort; a failed push must never affect the request path.
  }
}

/**
 * Coalesces failure alerts so a storm does not spam ntfy. The first occurrence
 * of a mode pings immediately and opens a 10-minute window; further occurrences
 * within it are only counted, and when the window closes a single summary is
 * sent if the mode recurred. So at most ~2 pushes per mode per 10 minutes.
 *
 * A single global instance (addressed by a fixed name) receives every alert,
 * called off the request path via ctx.waitUntil, so it never adds latency.
 */
export class AlertCoalescer implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const { mode, detail } = (await request.json()) as { mode: AlertMode; detail?: string };
    const key = `mode:${mode}`;
    const seen = await this.ctx.storage.get<number>(key);
    if (seen !== undefined) {
      await this.ctx.storage.put(key, seen + 1);
      return new Response(null, { status: 204 });
    }
    await this.ctx.storage.put(key, 1);
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + WINDOW_MS);
    }
    await pushNtfy(this.env, `randomify: ${mode}`, detail ?? `${mode} in production`);
    return new Response(null, { status: 204 });
  }

  /** Window closed: send a summary for any mode that recurred, then reset. */
  async alarm(): Promise<void> {
    const open = await this.ctx.storage.list<number>({ prefix: 'mode:' });
    for (const [key, count] of open) {
      const mode = key.slice('mode:'.length);
      if (count > 1) {
        await pushNtfy(this.env, `randomify: ${mode} x${count}`, `${count} in the last 10 min`);
      }
      await this.ctx.storage.delete(key);
    }
  }
}
