import { db } from "../db";

type Window = "minute" | "hour" | "day" | "month";

const windowSeconds: Record<Window, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
  month: 86400 * 30,
};

const countSince = (modelId: number, seconds: number, kind: string) => {
  const cutoff = Math.floor(Date.now() / 1000) - seconds;
  const stmt = db.prepare<{ c: number }, any>(
    `SELECT COUNT(*) as c FROM request_log WHERE model_id = ? AND ts >= ? AND kind = ?`
  );
  const row = stmt.get(modelId, cutoff, kind);
  return row?.c ?? 0;
};

const tokensSince = (modelId: number, seconds: number, kind: string) => {
  const cutoff = Math.floor(Date.now() / 1000) - seconds;
  const stmt = db.prepare<{ t: number | null }, any>(
    `SELECT SUM(total_tokens) as t FROM request_log WHERE model_id = ? AND ts >= ? AND kind = ?`
  );
  const row = stmt.get(modelId, cutoff, kind);
  return row?.t ?? 0;
};

export const recordRequest = (
  modelId: number,
  tokens?: { prompt?: number; completion?: number; total?: number },
  kind: "completion" | "search" = "completion"
) => {
  const ts = Math.floor(Date.now() / 1000);
  const total = tokens?.total ?? (tokens?.prompt ?? 0) + (tokens?.completion ?? 0);
  db.prepare(
    `INSERT INTO request_log(model_id, ts, tokens_in, tokens_out, total_tokens, kind)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(modelId, ts, tokens?.prompt ?? 0, tokens?.completion ?? 0, total, kind);
};

export const isRateLimited = (
  modelId: number,
  limits: {
    per_minute?: number | null;
    per_hour?: number | null;
    per_day?: number | null;
    per_month?: number | null;
    tokens_per_minute?: number | null;
    tokens_per_hour?: number | null;
    tokens_per_day?: number | null;
    tokens_per_month?: number | null;
  },
  kind: "completion" | "search" = "completion"
) => {
  const now = Math.floor(Date.now() / 1000);
  type LimitResult = { ok: boolean; retryAfter?: number };
  const evaluate = (cap: number | null | undefined, window: Window): LimitResult => {
    if (!cap) return { ok: true };
    const used = countSince(modelId, windowSeconds[window], kind);
    if (used < cap) return { ok: true };
    const oldestStmt = db.prepare<{ ts: number }, any>(
      `SELECT ts FROM request_log WHERE model_id = ? AND ts >= ? AND kind = ? ORDER BY ts ASC LIMIT 1`
    );
    const oldest = oldestStmt.get(modelId, now - windowSeconds[window], kind);
    if (!oldest?.ts) return { ok: false, retryAfter: windowSeconds[window] };
    return { ok: false, retryAfter: oldest.ts + windowSeconds[window] - now };
  };

  const evaluateTokens = (cap: number | null | undefined, window: Window): LimitResult => {
    if (!cap) return { ok: true };
    const used = tokensSince(modelId, windowSeconds[window], kind);
    if (used < cap) return { ok: true };
    const oldestStmt = db.prepare<{ ts: number }, any>(
      `SELECT ts FROM request_log WHERE model_id = ? AND ts >= ? AND kind = ? ORDER BY ts ASC LIMIT 1`
    );
    const oldest = oldestStmt.get(modelId, now - windowSeconds[window], kind);
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

  const tMinute = evaluateTokens(limits.tokens_per_minute, "minute");
  if (!tMinute.ok) return tMinute;
  const tHour = evaluateTokens(limits.tokens_per_hour, "hour");
  if (!tHour.ok) return tHour;
  const tDay = evaluateTokens(limits.tokens_per_day, "day");
  if (!tDay.ok) return tDay;
  const tMonth = evaluateTokens(limits.tokens_per_month, "month");
  if (!tMonth.ok) return tMonth;
  return { ok: true } as const;
};

export const usageSummary = () => {
  return db
    .prepare<
      {
        model_id: number;
        requests_1m: number;
        requests_1h: number;
        requests_1d: number;
        requests_30d: number;
        tokens_1m: number | null;
        tokens_1h: number | null;
        tokens_1d: number | null;
        tokens_30d: number | null;
        tokens: number | null;
      },
      any
    >(
      `
      WITH base AS (
        SELECT
          model_id,
          COUNT(*) FILTER (WHERE ts >= strftime('%s','now') - 60) AS requests_1m,
          COUNT(*) FILTER (WHERE ts >= strftime('%s','now') - 3600) AS requests_1h,
          COUNT(*) FILTER (WHERE ts >= strftime('%s','now') - 86400) AS requests_1d,
          COUNT(*) FILTER (WHERE ts >= strftime('%s','now') - 2592000) AS requests_30d,
          SUM(total_tokens) FILTER (WHERE ts >= strftime('%s','now') - 60) AS tokens_1m,
          SUM(total_tokens) FILTER (WHERE ts >= strftime('%s','now') - 3600) AS tokens_1h,
          SUM(total_tokens) FILTER (WHERE ts >= strftime('%s','now') - 86400) AS tokens_1d,
          SUM(total_tokens) FILTER (WHERE ts >= strftime('%s','now') - 2592000) AS tokens_30d,
          SUM(total_tokens) AS tokens
        FROM request_log
        GROUP BY model_id
      )
      SELECT * FROM base
      `
    )
    .all();
};
