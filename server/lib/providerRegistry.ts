import { db, ensureSchema } from "../db";

export type ProviderRecord = {
  id: string;
  display_name?: string | null;
  base_url: string;
  api_key?: string | null;
  active: number;
};

export type ModelRecord = {
  id: number;
  provider_id: string;
  name: string;
  supports_images: number;
  active: number;
  per_minute?: number | null;
  per_hour?: number | null;
  per_day?: number | null;
  per_month?: number | null;
};

ensureSchema();

export const upsertProvider = (provider: ProviderRecord) => {
  db.prepare(
    `
    INSERT INTO providers(id, display_name, base_url, api_key, active)
    VALUES (@id, @display_name, @base_url, @api_key, @active)
    ON CONFLICT(id) DO UPDATE SET
      display_name=excluded.display_name,
      base_url=excluded.base_url,
      api_key=excluded.api_key,
      active=excluded.active
    `
  ).run({
    id: provider.id,
    display_name: provider.display_name ?? null,
    base_url: provider.base_url,
    api_key: provider.api_key ?? null,
    active: provider.active ?? 1,
  });
};

export const upsertModel = (model: {
  provider_id: string;
  name: string;
  active?: number;
  supports_images?: number;
}) => {
  db.prepare(
    `
    INSERT INTO models(provider_id, name, active, supports_images)
    VALUES (@provider_id, @name, @active, @supports_images)
    ON CONFLICT(provider_id, name) DO UPDATE SET
      active=excluded.active,
      supports_images=excluded.supports_images
    `
  ).run({
    provider_id: model.provider_id,
    name: model.name,
    active: model.active ?? 1,
    supports_images: model.supports_images ?? 0,
  });
};

export const upsertRateLimit = (
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
  }
) => {
  db.prepare(
    `
    INSERT INTO rate_limits(model_id, per_minute, per_hour, per_day, per_month, tokens_per_minute, tokens_per_hour, tokens_per_day, tokens_per_month)
    VALUES (@model_id, @per_minute, @per_hour, @per_day, @per_month, @tokens_per_minute, @tokens_per_hour, @tokens_per_day, @tokens_per_month)
    ON CONFLICT(model_id) DO UPDATE SET
      per_minute=excluded.per_minute,
      per_hour=excluded.per_hour,
      per_day=excluded.per_day,
      per_month=excluded.per_month,
      tokens_per_minute=excluded.tokens_per_minute,
      tokens_per_hour=excluded.tokens_per_hour,
      tokens_per_day=excluded.tokens_per_day,
      tokens_per_month=excluded.tokens_per_month
    `
  ).run({
    model_id: modelId,
    per_minute: limits.per_minute ?? null,
    per_hour: limits.per_hour ?? null,
    per_day: limits.per_day ?? null,
    per_month: (limits as any).per_month ?? null,
    tokens_per_minute: limits.tokens_per_minute ?? null,
    tokens_per_hour: limits.tokens_per_hour ?? null,
    tokens_per_day: limits.tokens_per_day ?? null,
    tokens_per_month: limits.tokens_per_month ?? null,
  });
};

export const setMetaModel = (metaName: string, modelIds: number[]) => {
  const tx = db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO meta_models(name) VALUES (?)`).run(metaName);
    db.prepare(`DELETE FROM meta_model_targets WHERE meta_name = ?`).run(metaName);
    modelIds.forEach((modelId, idx) => {
      db.prepare(
        `INSERT INTO meta_model_targets(meta_name, model_id, position) VALUES (?, ?, ?)`
      ).run(metaName, modelId, idx);
    });
  });
  tx();
};

export const deleteMetaModel = (metaName: string) => {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM meta_model_targets WHERE meta_name = ?`).run(metaName);
    db.prepare(`DELETE FROM meta_models WHERE name = ?`).run(metaName);
  });
  tx();
};

export const listModels = () => {
  return db
    .prepare<ModelRecord & {
      tokens_per_minute?: number | null;
      tokens_per_hour?: number | null;
      tokens_per_day?: number | null;
      tokens_per_month?: number | null;
    }, any>(
      `
      SELECT m.id, m.provider_id, m.name, m.supports_images, m.active,
             rl.per_minute, rl.per_hour, rl.per_day, rl.per_month,
             rl.tokens_per_minute, rl.tokens_per_hour, rl.tokens_per_day, rl.tokens_per_month
      FROM models m
      LEFT JOIN rate_limits rl ON rl.model_id = m.id
      ORDER BY m.provider_id, m.id
      `
    )
    .all();
};

export const listActiveModels = () => {
  return db
    .prepare<ModelRecord & { provider_active: number; tokens_per_minute?: number | null; tokens_per_hour?: number | null; tokens_per_day?: number | null; tokens_per_month?: number | null }, any>(
      `
      SELECT m.id, m.provider_id, m.name, m.supports_images, m.active,
             rl.per_minute, rl.per_hour, rl.per_day, rl.per_month,
             rl.tokens_per_minute, rl.tokens_per_hour, rl.tokens_per_day, rl.tokens_per_month,
             p.active as provider_active
      FROM models m
      JOIN providers p ON p.id = m.provider_id
      LEFT JOIN rate_limits rl ON rl.model_id = m.id
      WHERE m.active = 1 AND p.active = 1
      ORDER BY m.provider_id, m.id
      `
    )
    .all();
};

export const listProviders = () => {
  return db.prepare<ProviderRecord, any>(`SELECT * FROM providers ORDER BY id`).all();
};

export const listMetaModels = () => {
  return db
    .prepare<{ meta: string; model_id: number; name: string; provider_id: string }, any>(
      `
      SELECT mt.meta_name as meta, mt.model_id, m.name, m.provider_id
      FROM meta_model_targets mt
      JOIN models m ON m.id = mt.model_id
      ORDER BY mt.meta_name, mt.position
      `
    )
    .all();
};

export const listActiveMetaModels = () => {
  return db
    .prepare<{ meta: string; model_id: number; name: string; provider_id: string; position: number }, any>(
      `
      SELECT mt.meta_name as meta, mt.model_id, m.name, m.provider_id, mt.position
      FROM meta_model_targets mt
      JOIN models m ON m.id = mt.model_id
      JOIN providers p ON p.id = m.provider_id
      WHERE m.active = 1 AND p.active = 1
      ORDER BY mt.meta_name, mt.position
      `
    )
    .all();
};

export const modelByName = (name: string): (ModelRecord & ProviderRecord) | null => {
  const stmt = db.prepare<ModelRecord & ProviderRecord, any>(
    `
    SELECT m.*, p.base_url, p.api_key, p.active as provider_active, p.display_name
    FROM models m
    JOIN providers p ON p.id = m.provider_id
    WHERE m.name = ? AND m.active = 1 AND p.active = 1
    LIMIT 1
    `
  );
  return stmt.get(name) ?? null;
};

export const metaCandidates = (meta: string): (ModelRecord & ProviderRecord & { position: number })[] => {
  return db
    .prepare<ModelRecord & ProviderRecord & { position: number; provider_active: number }, any>(
      `
      SELECT m.*, mt.position, p.base_url, p.api_key, p.active as provider_active, p.display_name
      FROM meta_model_targets mt
      JOIN models m ON m.id = mt.model_id
      JOIN providers p ON p.id = m.provider_id
      WHERE mt.meta_name = ? AND m.active = 1 AND p.active = 1
      ORDER BY mt.position ASC, m.id ASC
      `
    )
    .all(meta);
};

export const modelWithLimits = (modelId: number): (ModelRecord & ProviderRecord) | null => {
  const row = db.prepare<ModelRecord & ProviderRecord, any>(
    `
    SELECT m.*, rl.per_minute, rl.per_hour, rl.per_day, rl.per_month,
           rl.tokens_per_minute, rl.tokens_per_hour, rl.tokens_per_day, rl.tokens_per_month,
           p.base_url, p.api_key, p.active as provider_active, p.display_name
    FROM models m
    JOIN providers p ON p.id = m.provider_id
    LEFT JOIN rate_limits rl ON rl.model_id = m.id
    WHERE m.id = ? AND m.active = 1 AND p.active = 1
    LIMIT 1
    `
  );
  return row.get(modelId) ?? null;
};

export const modelId = (providerId: string, name: string): number | null => {
  const row = db.prepare<{ id: number }, any>(
    `SELECT id FROM models WHERE provider_id = ? AND name = ? LIMIT 1`
  ).get(providerId, name);
  return row?.id ?? null;
};
