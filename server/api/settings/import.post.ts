import { createError, defineEventHandler, readBody } from "h3";
import { db, ensureSchema } from "../../db";
import { requireAdmin } from "../../utils/auth";

type DbDump = Partial<{
  providers: any[];
  models: any[];
  rate_limits: any[];
  request_log: any[];
  search_providers: any[];
  search_request_log: any[];
  meta_models: any[];
  meta_model_targets: any[];
}>;

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  ensureSchema();

  const dump = (await readBody<DbDump>(event)) ?? {};

  const providers = asArray(dump.providers);
  const models = asArray(dump.models);
  const rateLimits = asArray(dump.rate_limits);
  const requestLog = asArray(dump.request_log);
  const searchProviders = asArray(dump.search_providers);
  const searchRequestLog = asArray(dump.search_request_log);
  const metaModels = asArray(dump.meta_models);
  const metaModelTargets = asArray(dump.meta_model_targets);

  if (!providers.length && !models.length && !searchProviders.length && !metaModels.length) {
    throw createError({ statusCode: 400, statusMessage: "No data to import" });
  }

  const importTx = db.transaction(() => {
    db.run("PRAGMA foreign_keys = ON;");

    db.run("DELETE FROM meta_models;");
    db.run("DELETE FROM search_providers;");
    db.run("DELETE FROM providers;");
    try {
      db.run("DELETE FROM sqlite_sequence;");
    } catch {}

    const insertProvider = db.prepare(
      `INSERT INTO providers(id, display_name, base_url, api_key, active)
       VALUES (@id, @display_name, @base_url, @api_key, @active)`
    );
    for (const row of providers) {
      insertProvider.run({
        id: String(row.id),
        display_name: row.display_name ?? null,
        base_url: String(row.base_url),
        api_key: row.api_key ?? null,
        active: row.active ?? 1,
      });
    }

    const insertModel = db.prepare(
      `INSERT INTO models(id, provider_id, name, grade, priority, supports_images, active)
       VALUES (@id, @provider_id, @name, @grade, @priority, @supports_images, @active)`
    );
    for (const row of models) {
      insertModel.run({
        id: Number(row.id),
        provider_id: String(row.provider_id),
        name: String(row.name),
        grade: row.grade ?? 0,
        priority: row.priority ?? 0,
        supports_images: row.supports_images ?? 0,
        active: row.active ?? 1,
      });
    }

    const insertRateLimit = db.prepare(
      `INSERT INTO rate_limits(
         model_id, per_minute, per_hour, per_day, per_month,
         tokens_per_minute, tokens_per_hour, tokens_per_day, tokens_per_month
       ) VALUES (
         @model_id, @per_minute, @per_hour, @per_day, @per_month,
         @tokens_per_minute, @tokens_per_hour, @tokens_per_day, @tokens_per_month
       )`
    );
    for (const row of rateLimits) {
      insertRateLimit.run({
        model_id: Number(row.model_id),
        per_minute: row.per_minute ?? null,
        per_hour: row.per_hour ?? null,
        per_day: row.per_day ?? null,
        per_month: row.per_month ?? null,
        tokens_per_minute: row.tokens_per_minute ?? null,
        tokens_per_hour: row.tokens_per_hour ?? null,
        tokens_per_day: row.tokens_per_day ?? null,
        tokens_per_month: row.tokens_per_month ?? null,
      });
    }

    const insertRequestLog = db.prepare(
      `INSERT INTO request_log(id, model_id, ts, tokens_in, tokens_out, total_tokens, kind)
       VALUES (@id, @model_id, @ts, @tokens_in, @tokens_out, @total_tokens, @kind)`
    );
    for (const row of requestLog) {
      insertRequestLog.run({
        id: Number(row.id),
        model_id: Number(row.model_id),
        ts: Number(row.ts),
        tokens_in: row.tokens_in ?? 0,
        tokens_out: row.tokens_out ?? 0,
        total_tokens: row.total_tokens ?? 0,
        kind: row.kind ?? "completion",
      });
    }

    const insertSearchProvider = db.prepare(
      `INSERT INTO search_providers(
         id, display_name, base_url, api_key, priority, active, per_minute, per_hour, per_day, per_month
       ) VALUES (
         @id, @display_name, @base_url, @api_key, @priority, @active, @per_minute, @per_hour, @per_day, @per_month
       )`
    );
    for (const row of searchProviders) {
      insertSearchProvider.run({
        id: String(row.id),
        display_name: row.display_name ?? null,
        base_url: String(row.base_url),
        api_key: row.api_key ?? null,
        priority: row.priority ?? 0,
        active: row.active ?? 1,
        per_minute: row.per_minute ?? null,
        per_hour: row.per_hour ?? null,
        per_day: row.per_day ?? null,
        per_month: row.per_month ?? null,
      });
    }

    const insertSearchRequestLog = db.prepare(
      `INSERT INTO search_request_log(id, provider_id, ts)
       VALUES (@id, @provider_id, @ts)`
    );
    for (const row of searchRequestLog) {
      insertSearchRequestLog.run({
        id: Number(row.id),
        provider_id: String(row.provider_id),
        ts: Number(row.ts),
      });
    }

    const insertMetaModel = db.prepare(`INSERT INTO meta_models(name) VALUES (@name)`);
    for (const row of metaModels) {
      insertMetaModel.run({ name: String(row.name) });
    }

    const insertMetaModelTarget = db.prepare(
      `INSERT INTO meta_model_targets(meta_name, model_id, position)
       VALUES (@meta_name, @model_id, @position)`
    );
    for (const row of metaModelTargets) {
      insertMetaModelTarget.run({
        meta_name: String(row.meta_name),
        model_id: Number(row.model_id),
        position: row.position ?? 0,
      });
    }
  });

  importTx();

  return {
    ok: true,
    counts: {
      providers: providers.length,
      models: models.length,
      rate_limits: rateLimits.length,
      request_log: requestLog.length,
      search_providers: searchProviders.length,
      search_request_log: searchRequestLog.length,
      meta_models: metaModels.length,
      meta_model_targets: metaModelTargets.length,
    },
  };
});

