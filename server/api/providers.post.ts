import { defineEventHandler, readBody, createError } from "h3";
import { upsertProvider } from "../lib/providerRegistry";
import { requireAdmin } from "../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody<{
    id?: string;
    display_name?: string;
    base_url?: string;
    api_key?: string;
    kind?: "openai" | "openrouter" | string;
  }>(event);

  if (!body?.id || !body?.base_url) {
    throw createError({ statusCode: 400, statusMessage: "id and base_url are required" });
  }

  const kind = body.kind === "openrouter" ? "openrouter" : "openai";
  if (kind === "openrouter") {
    throw createError({ statusCode: 400, statusMessage: "OpenRouter providers are managed from Models" });
  }

  upsertProvider({
    id: body.id,
    display_name: body.display_name ?? null,
    base_url: body.base_url,
    api_key: body.api_key ?? null,
    kind,
    active: 1,
  });

  return { ok: true };
});
