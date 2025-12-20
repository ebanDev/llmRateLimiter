import {
  defineEventHandler,
  readBody,
  getRequestHeader,
  createError,
  setResponseStatus,
  setResponseHeader,
  sendStream,
} from "h3";
import {
  metaCandidates,
  modelByName,
  modelWithLimits,
} from "../../../lib/providerRegistry";
import { isRateLimited, recordRequest } from "../../../lib/rateLimiter";
import { buildOpenRouterHeaders, isOpenRouterProvider, openRouterProviderSlug } from "../../../lib/openrouter";

const completionsPath = "/chat/completions";

const buildCompletionsUrl = (baseUrl: string) => {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${completionsPath}`;
};

const recordUsage = (
  modelId: string,
  usage?: { prompt?: number; completion?: number; total?: number }
) => {
  if (!usage) return;
  recordRequest(modelId, {
    prompt: usage.prompt ?? 0,
    completion: usage.completion ?? 0,
    total: usage.total ?? undefined,
  });
};

const appendModelEvent = (stream: ReadableStream<Uint8Array>, model: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = stream.getReader();
      const encoder = new TextEncoder();

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ "x-model": model })}\n\n`)
        );
        controller.close();
      };

      pump().catch(() => controller.close());
    },
  });

const conversationHasImageInputs = (payload: any) => {
  const messages = payload?.messages;
  if (!Array.isArray(messages)) return false;

  for (const message of messages) {
    const content = message?.content;

    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part) continue;
        const type = String(part?.type ?? "").toLowerCase();
        if (type.includes("image")) return true;
        if (part?.image_url) return true;
        if (part?.image?.url) return true;
      }
      continue;
    }

    if (content && typeof content === "object") {
      const type = String((content as any)?.type ?? "").toLowerCase();
      if (type.includes("image")) return true;
      if ((content as any)?.image_url) return true;
      if ((content as any)?.image?.url) return true;
    }

    if ((message as any)?.image_url) return true;
    if (Array.isArray((message as any)?.attachments) && (message as any).attachments.length) return true;
  }

  return false;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event);
  const requestedModel = body?.model;
  if (!requestedModel) {
    throw createError({ statusCode: 400, statusMessage: "model is required" });
  }

  const wantsStream = body?.stream === true;
  const needsImageCapableModel = conversationHasImageInputs(body);

  // Resolve model or meta
  const directMatch = modelByName(requestedModel);
  const candidates = directMatch ? [directMatch] : metaCandidates(requestedModel);
  if (!candidates.length) {
    throw createError({ statusCode: 404, statusMessage: `No model or meta-model '${requestedModel}'` });
  }

  const routedCandidates = needsImageCapableModel
    ? candidates.filter((c) => Boolean((c as any).supports_images))
    : candidates;

  if (!routedCandidates.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `No image-capable targets for '${requestedModel}'`,
    });
  }

  let chosen: any = null;
  let lastLimit: { retryAfter?: number } | null = null;

  for (const candidate of routedCandidates) {
    const limits = modelWithLimits(candidate.id);
    const rate = isRateLimited(
      candidate.id,
      {
        per_minute: limits?.per_minute,
        per_hour: limits?.per_hour,
        per_day: limits?.per_day,
        per_month: (limits as any)?.per_month,
        tokens_per_minute: (limits as any)?.tokens_per_minute,
        tokens_per_hour: (limits as any)?.tokens_per_hour,
        tokens_per_day: (limits as any)?.tokens_per_day,
        tokens_per_month: (limits as any)?.tokens_per_month,
      },
      "completion"
    );

    if (rate.ok) {
      chosen = candidate;
      break;
    }

    lastLimit = rate;
  }

  if (!chosen) {
    setResponseStatus(event, 429);
    return {
      error: "Rate limit exceeded for all targets",
      retry_after_seconds: lastLimit?.retryAfter,
    };
  }

  const url = buildCompletionsUrl(chosen.base_url);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (isOpenRouterProvider((chosen as any).provider_id)) {
    Object.assign(headers, buildOpenRouterHeaders());
  }
  const incomingAuth = getRequestHeader(event, "authorization");
  const authHeader = chosen.api_key ? `Bearer ${chosen.api_key}` : incomingAuth;
  if (authHeader) headers.authorization = authHeader;

  console.log(`→ Forwarding request to model '${chosen.name}' at ${url}`);
  let upstream;
  try {
    const providerSlug = isOpenRouterProvider((chosen as any).provider_id)
      ? openRouterProviderSlug((chosen as any).provider_id)
      : null;
    const mergedProviderPrefs = providerSlug
      ? (() => {
          const incomingProvider = body?.provider && typeof body.provider === "object" ? { ...body.provider } : {};
          const order = Array.isArray(incomingProvider.order) ? incomingProvider.order.slice() : [];
          if (!order.includes(providerSlug)) order.unshift(providerSlug);
          return {
            ...incomingProvider,
            order,
            allow_fallbacks: false,
          };
        })()
      : body?.provider;

    upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        model: chosen.name,
        ...(providerSlug ? { provider: mergedProviderPrefs } : {}),
      }),
    });
  } catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `Upstream request failed: ${err?.message}` });
  }

  if (wantsStream) {
    if (!upstream.body) {
      throw createError({ statusCode: 502, statusMessage: "Upstream missing body" });
    }

    const contentType = upstream.headers.get("content-type") || "application/json";
    setResponseStatus(event, upstream.status);
    setResponseHeader(event, "content-type", contentType);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-type") return;
      setResponseHeader(event, key, value);
    });

    const bodyStream: any = upstream.body as any;
    const canTee = typeof bodyStream.tee === "function";

    if (canTee) {
      const [clientStream, inspectStream] = bodyStream.tee();

      (async () => {
        try {
          const reader = inspectStream.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let lastUsage: { prompt?: number; completion?: number; total?: number } | undefined;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
              const dataLines = part
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.replace(/^data:\s?/, ""));
              if (!dataLines.length) continue;
              const payload = dataLines.join("\n");
              try {
                const parsed = JSON.parse(payload);
                if (parsed?.usage?.total_tokens !== undefined) {
                  lastUsage = {
                    prompt: parsed.usage.prompt_tokens ?? 0,
                    completion: parsed.usage.completion_tokens ?? 0,
                    total: parsed.usage.total_tokens ?? undefined,
                  };
                }
              } catch {
                // ignore malformed chunks
              }
            }
          }

          if (lastUsage) {
            recordUsage(chosen.id, lastUsage);
            console.log(`← Recorded usage for model '${chosen.name}':`, lastUsage);
          }
        } catch {
          // ignore inspect stream errors
        }
      })();

      return sendStream(event, appendModelEvent(clientStream, chosen.name));
    }

    return sendStream(event, appendModelEvent(bodyStream, chosen.name));
  }

  const text = await upstream.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (parsed?.usage) {
    recordUsage(chosen.id, {
      prompt: parsed.usage.prompt_tokens ?? 0,
      completion: parsed.usage.completion_tokens ?? 0,
      total: parsed.usage.total_tokens ?? undefined,
    });
  }

  setResponseStatus(event, upstream.status);
  setResponseHeader(event, "content-type", "application/json; charset=utf-8");

  if (parsed) {
    return { ...parsed, "x-model": chosen.name };
  }

  return { raw: text, "x-model": chosen.name };
});
