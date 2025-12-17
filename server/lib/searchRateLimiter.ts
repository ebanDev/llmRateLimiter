import { db } from "../db";

type Window = "minute" | "hour" | "day" | "month";

const windowSeconds: Record<Window, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
  month: 86400 * 30,
};

const countSince = (providerId: string, seconds: number) => {
  const cutoff = Math.floor(Date.now() / 1000) - seconds;
  const stmt = db.prepare<{ c: number }, any>(
    `SELECT COUNT(*) as c FROM search_request_log WHERE provider_id = ? AND ts >= ?`
  );
  const row = stmt.get(providerId, cutoff);
  return row?.c ?? 0;
};

export const recordSearchRequest = (providerId: string) => {
  const ts = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO search_request_log(provider_id, ts) VALUES (?, ?)`).run(providerId, ts);
};

export const isSearchRateLimited = (
  providerId: string,
  limits: { per_minute?: number | null; per_hour?: number | null; per_day?: number | null; per_month?: number | null }
) => {
  const now = Math.floor(Date.now() / 1000);
  type LimitResult = { ok: boolean; retryAfter?: number };
  const evaluate = (cap: number | null | undefined, window: Window): LimitResult => {
    if (!cap) return { ok: true };
    const used = countSince(providerId, windowSeconds[window]);
    if (used < cap) return { ok: true };
    const oldestStmt = db.prepare<{ ts: number }, any>(
      `SELECT ts FROM search_request_log WHERE provider_id = ? AND ts >= ? ORDER BY ts ASC LIMIT 1`
    );
    const oldest = oldestStmt.get(providerId, now - windowSeconds[window]);
    if (!oldest?.ts) return { ok: false, retryAfter: windowSeconds[window] };
    return { ok: false, retryAfter: oldest.ts + windowSeconds[window] - now };
  };

  const minute = evaluate(limits.per_minute, "minute");
  if (!minute.ok) return minute;
  const hour = evaluate(limits.per_hour, "hour");
  if (!hour.ok) return hour;
  const day = evaluate(limits.per_day, "day");
  if (!day.ok) return day;
  const month = evaluate(limits.per_month, "month");
  if (!month.ok) return month;
  return { ok: true } as const;
};
