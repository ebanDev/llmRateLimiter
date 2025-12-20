import { createError } from "h3";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_PROVIDER_PREFIX = "openrouter-";
const OPENROUTER_REFERER = "https://metallm.app";
const OPENROUTER_TITLE = "MetaLLM";

export type OpenRouterModel = {
  id?: string;
  name?: string;
  provider?: {
    id?: string;
    name?: string;
  };
};

export type OpenRouterEndpoint = {
  name?: string;
  provider_name?: string;
  tag?: string | null;
};

export const isOpenRouterProvider = (providerId?: string) =>
  Boolean(providerId?.startsWith(OPENROUTER_PROVIDER_PREFIX));

export const openRouterProviderSlug = (providerId: string) =>
  providerId.replace(OPENROUTER_PROVIDER_PREFIX, "");

export const buildOpenRouterHeaders = (providerSlug?: string) => {
  const headers: Record<string, string> = {
    "x-title": OPENROUTER_TITLE,
    referer: OPENROUTER_REFERER,
  };

  return headers;
};

export const fetchOpenRouterModels = async (apiKey?: string) => {
  const headers = buildOpenRouterHeaders();
  const authKey = apiKey || process.env.OPENROUTER_API_KEY;
  if (authKey) headers.authorization = `Bearer ${authKey}`;

  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: `OpenRouter models fetch failed: ${res.statusText}`,
    });
  }

  const json = await res.json();
  const models = Array.isArray(json?.data) ? json.data : json?.models ?? [];
  return { models, raw: json };
};

export const parseModelIdentifier = (modelId: string) => {
  const id = modelId.includes(":") ? modelId.split(":")[0] : modelId;
  const [author, ...rest] = id.split("/");
  const slug = rest.join("/");
  if (!author || !slug) throw new Error(`Invalid OpenRouter model id '${modelId}'`);
  return { author, slug };
};

export const fetchOpenRouterEndpoints = async (modelId: string, apiKey?: string) => {
  const { author, slug } = parseModelIdentifier(modelId);
  const headers = buildOpenRouterHeaders();
  const authKey = apiKey || process.env.OPENROUTER_API_KEY;
  if (authKey) headers.authorization = `Bearer ${authKey}`;

  const res = await fetch(`${OPENROUTER_BASE_URL}/models/${author}/${slug}/endpoints`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: `OpenRouter endpoints fetch failed: ${res.statusText}`,
    });
  }

  const json = await res.json();
  const endpoints = Array.isArray(json?.data?.endpoints) ? json.data.endpoints : [];
  return { endpoints, raw: json };
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/_-]/g, "");

export const endpointProviderSlug = (endpoint: OpenRouterEndpoint) => {
  if (endpoint.name) return slugify(endpoint.name);
  const base = endpoint.provider_name ? slugify(endpoint.provider_name) : "";
  const tag = endpoint.tag ? slugify(endpoint.tag) : "";
  return tag ? `${base}/${tag}` : base;
};

export const groupOpenRouterProviders = (models: OpenRouterModel[]) => {
  const directory = new Map<
    string,
    { id: string; slug: string; name: string; models: string[] }
  >();

  for (const model of models) {
    const modelId = String(model?.id || model?.name || "").trim();
    if (!modelId) continue;

    const providerSlug =
      model.provider?.id ||
      model.provider?.name ||
      (modelId.includes("/") ? modelId.split("/")[0] : null);
    if (!providerSlug) continue;

    const slug = providerSlug.toLowerCase();
    const prefixedId = `${OPENROUTER_PROVIDER_PREFIX}${slug}`;
    const entry =
      directory.get(prefixedId) ||
      {
        id: prefixedId,
        slug,
        name: model.provider?.name || slug,
        models: [],
      };

    entry.models.push(modelId);
    directory.set(prefixedId, entry);
  }

  return Array.from(directory.values()).map((entry) => ({
    ...entry,
    models: Array.from(new Set(entry.models)).sort(),
  }));
};
