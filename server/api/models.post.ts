import { defineEventHandler, readBody, createError } from "h3";
import { db } from "../db";
import { upsertModel, upsertRateLimit } from "../lib/providerRegistry";
import { requireAdmin } from "../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody<{
    provider_id?: string;
    name?: string;
    supports_images?: boolean | number | string;
    per_minute?: number | string;
    per_hour?: number | string;
    per_day?: number | string;
    per_month?: number | string;
    tokens_per_minute?: number | string;
    tokens_per_hour?: number | string;
    tokens_per_day?: number | string;
    tokens_per_month?: number | string;
  }>(event);

  if (!body?.provider_id || !body?.name) {
    throw createError({ statusCode: 400, statusMessage: "provider_id and name are required" });
  }

  const supportsImages =
    body.supports_images === true ||
    body.supports_images === 1 ||
    body.supports_images === "1" ||
    body.supports_images === "true";

  upsertModel({
    provider_id: body.provider_id,
    name: body.name,
    active: 1,
    supports_images: supportsImages ? 1 : 0,
  });

  const modelRow = db
    .prepare<{ id: number }, any>(`SELECT id FROM models WHERE provider_id = ? AND name = ? LIMIT 1`)
    .get(body.provider_id, body.name);

  if (modelRow) {
    upsertRateLimit(modelRow.id, {
      per_minute: body.per_minute ? Number(body.per_minute) : null,
      per_hour: body.per_hour ? Number(body.per_hour) : null,
      per_day: body.per_day ? Number(body.per_day) : null,
      per_month: body.per_month ? Number(body.per_month) : null,
      tokens_per_minute: body.tokens_per_minute ? Number(body.tokens_per_minute) : null,
      tokens_per_hour: body.tokens_per_hour ? Number(body.tokens_per_hour) : null,
      tokens_per_day: body.tokens_per_day ? Number(body.tokens_per_day) : null,
      tokens_per_month: body.tokens_per_month ? Number(body.tokens_per_month) : null,
    });
  }

  return { ok: true, id: modelRow?.id };
});
