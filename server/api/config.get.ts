import { defineEventHandler } from "h3";
import { ensureOpenRouterProvider, listMetaModels, listModels, listProviders } from "../lib/providerRegistry";
import { listSearchProviders } from "../lib/searchRegistry";
import { usageSummary } from "../lib/rateLimiter";
import { requireAdmin } from "../utils/auth";

export default defineEventHandler((event) => {
  requireAdmin(event);
  ensureOpenRouterProvider();
  return {
    providers: listProviders(),
    models: listModels(),
    meta: listMetaModels(),
    searchProviders: listSearchProviders(),
    usage: usageSummary(),
  };
});
