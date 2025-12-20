import { createError, defineEventHandler } from "h3";
import {
  endpointProviderSlug,
  fetchOpenRouterEndpoints,
  OPENROUTER_PROVIDER_PREFIX,
} from "../../../../../lib/openrouter";
import { requireAdmin } from "../../../../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const author = event.context.params?.author;
  const slug = event.context.params?.slug;
  if (!author || !slug) {
    throw createError({ statusCode: 400, statusMessage: "author and slug are required" });
  }

  const modelId = `${author}/${slug}`;
  const { endpoints } = await fetchOpenRouterEndpoints(modelId);
  const providers = endpoints.map((ep) => {
    const providerSlug = endpointProviderSlug(ep);
    return {
      id: `${OPENROUTER_PROVIDER_PREFIX}${providerSlug}`,
      slug: providerSlug,
      name: ep.name || ep.provider_name || providerSlug,
      provider_name: ep.provider_name || null,
      tag: ep.tag || null,
    };
  });

  return {
    fetched_at: new Date().toISOString(),
    model: modelId,
    total_endpoints: endpoints.length,
    endpoints,
    providers,
  };
});
