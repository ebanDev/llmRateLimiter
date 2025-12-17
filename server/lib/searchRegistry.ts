import { db, ensureSchema } from "../db";

export type SearchProvider = {
  id: string;
  display_name?: string | null;
  base_url: string;
  api_key?: string | null;
  priority: number;
  active: number;
  per_minute?: number | null;
  per_hour?: number | null;
  per_day?: number | null;
  per_month?: number | null;
};

ensureSchema();

export const upsertSearchProvider = (p: SearchProvider) => {
  db.prepare(
    `
    INSERT INTO search_providers(id, display_name, base_url, api_key, priority, active, per_minute, per_hour, per_day, per_month)
    VALUES (@id, @display_name, @base_url, @api_key, @priority, @active, @per_minute, @per_hour, @per_day, @per_month)
    ON CONFLICT(id) DO UPDATE SET
      display_name=excluded.display_name,
      base_url=excluded.base_url,
      api_key=excluded.api_key,
      priority=excluded.priority,
      active=excluded.active,
      per_minute=excluded.per_minute,
      per_hour=excluded.per_hour,
      per_day=excluded.per_day,
      per_month=excluded.per_month
    `
  ).run({
    ...p,
    display_name: p.display_name ?? null,
    api_key: p.api_key ?? null,
    per_minute: p.per_minute ?? null,
    per_hour: p.per_hour ?? null,
    per_day: p.per_day ?? null,
    per_month: p.per_month ?? null,
  });
};

export const listSearchProviders = () => {
  return db
    .prepare<SearchProvider, any>(
      `
      SELECT * FROM search_providers
      ORDER BY priority DESC, id ASC
      `
    )
    .all();
};

export const activeSearchProviders = () => {
  return db
    .prepare<SearchProvider, any>(
      `
      SELECT * FROM search_providers
      WHERE active = 1
      ORDER BY priority DESC, id ASC
      `
    )
    .all();
};
