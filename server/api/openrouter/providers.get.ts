import { defineEventHandler, getQuery } from "h3";
import {
  fetchOpenRouterModels,
  groupOpenRouterProviders,
  openRouterProviderSlug,
} from "../../lib/openrouter";
import { requireAdmin } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const query = getQuery(event);
  const filter = typeof query.provider === "string" ? query.provider : null;

  const { models } = await fetchOpenRouterModels();
  const providers = groupOpenRouterProviders(models);

  const normalizedFilter = filter ? openRouterProviderSlug(filter) : null;
  const filteredProviders = normalizedFilter
    ? providers.filter((p) => p.slug === normalizedFilter || p.id === filter)
    : providers;

  return {
    fetched_at: new Date().toISOString(),
    total_providers: providers.length,
    total_models: models.length,
    providers: filteredProviders,
  };
});
