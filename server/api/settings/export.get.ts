import { defineEventHandler, setHeader } from "h3";
import { db, ensureSchema } from "../../db";
import { requireAdmin } from "../../utils/auth";

export default defineEventHandler((event) => {
  requireAdmin(event);
  ensureSchema();

  setHeader(event, "content-type", "application/json; charset=utf-8");

  const providers = db.prepare<any, any>("SELECT * FROM providers ORDER BY id").all();
  const models = db.prepare<any, any>("SELECT * FROM models ORDER BY provider_id, id").all();
  const rateLimits = db.prepare<any, any>("SELECT * FROM rate_limits ORDER BY model_id").all();
  const requestLog = db.prepare<any, any>("SELECT * FROM request_log ORDER BY id").all();
  const searchProviders = db.prepare<any, any>("SELECT * FROM search_providers ORDER BY priority DESC, id ASC").all();
  const searchRequestLog = db
    .prepare<any, any>("SELECT * FROM search_request_log ORDER BY id")
    .all();
  const metaModels = db.prepare<any, any>("SELECT * FROM meta_models ORDER BY name").all();
  const metaModelTargets = db
    .prepare<any, any>("SELECT * FROM meta_model_targets ORDER BY meta_name, position, model_id")
    .all();

  return {
    exported_at: new Date().toISOString(),
    providers,
    models,
    rate_limits: rateLimits,
    request_log: requestLog,
    search_providers: searchProviders,
    search_request_log: searchRequestLog,
    meta_models: metaModels,
    meta_model_targets: metaModelTargets,
  };
});

