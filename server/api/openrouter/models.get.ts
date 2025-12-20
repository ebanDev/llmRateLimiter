import { defineEventHandler } from "h3";
import { fetchOpenRouterModels } from "../../lib/openrouter";
import { requireAdmin } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const { models } = await fetchOpenRouterModels();
  return {
    fetched_at: new Date().toISOString(),
    total_models: models.length,
    models,
  };
});
