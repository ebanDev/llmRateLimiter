#!/usr/bin/env node
// Simple test script to stream chat completions from the local API without relying on fetch decompression
// Usage:
//   node scripts/test-chat-stream.js [model] [prompt]
//   node scripts/test-chat-stream.js --tests basic,tools,structured --model base
//
// Env:
//   API_BASE_URL=http://localhost:8798
//   API_ENDPOINT=/api/v1/chat/completions
//   ADMIN_TOKEN=...

import http from "http";
import https from "https";
import { createBrotliDecompress, createGunzip, createInflate } from "zlib";

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }

    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
      continue;
    }
    args[key] = true;
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));

const model = args.model || args._[0] || "base"; // replace with an actual meta model id
const prompt = args.prompt || args._[1] || "Hello, world";
const tests = String(args.tests || "nonstream")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

const acceptEncoding = args["accept-encoding"] || process.env.ACCEPT_ENCODING || "identity";

const key = process.env.ADMIN_TOKEN;
const baseUrl = args["base-url"] || process.env.API_BASE_URL || "http://localhost:3000";
const endpointPrimary = args.endpoint || process.env.API_ENDPOINT || "/api/v1/chat/completions";
const timeoutMs = Number(args.timeout || process.env.API_TIMEOUT_MS || 60_000);
const raw = Boolean(args.raw);

const getClient = (url) => (url.protocol === "https:" ? https : http);

const decodeStream = (res) => {
  const enc = String(res.headers["content-encoding"] || "").toLowerCase();
  if (enc === "br") return res.pipe(createBrotliDecompress());
  if (enc === "gzip") return res.pipe(createGunzip());
  if (enc === "deflate") return res.pipe(createInflate());
  return res;
};

const parseSse = (chunkText, onEvent) => {
  const normalized = chunkText.replace(/\r\n/g, "\n");
  const events = normalized.split("\n\n");
  const rest = events.pop() || "";

  for (const event of events) {
    const dataLines = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""));

    if (!dataLines.length) continue;
    const data = dataLines.join("\n").trim();
    onEvent(data);
  }

  return rest;
};

const streamChatCompletion = (payloadObj, { label }) =>
  new Promise((resolve, reject) => {
    const url = new URL(endpointPrimary, baseUrl);
    const client = getClient(url);
    const payload = JSON.stringify(payloadObj);

    const req = client.request(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          "accept-encoding": acceptEncoding,
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
      },
      (res) => {
        const body = decodeStream(res);

        if (res.statusCode && res.statusCode >= 400) {
          body.setEncoding("utf8");
          let errBuf = "";
          body.on("data", (c) => (errBuf += c));
          body.on("end", () => {
            const msg = `HTTP ${res.statusCode}: ${errBuf || res.statusMessage || "request failed"}`;
            reject(Object.assign(new Error(msg), { statusCode: res.statusCode, body: errBuf }));
          });
          return;
        }

        if (raw) {
          console.log(`\n--- ${label} (raw stream) ---`);
          body.on("data", (chunk) => process.stdout.write(chunk.toString()));
          body.on("end", () => resolve({ ok: true, raw: true }));
          return;
        }

        const state = {
          content: "",
          toolCalls: new Map(),
          finishReasons: [],
          seenDone: false,
          xModel: undefined,
          error: undefined,
          events: 0,
        };

        const upsertToolCall = (call) => {
          const index = call?.index ?? 0;
          const current = state.toolCalls.get(index) || {
            index,
            id: undefined,
            type: call?.type,
            name: undefined,
            arguments: "",
          };

          if (call?.id) current.id = call.id;
          if (call?.type) current.type = call.type;
          if (call?.function?.name) current.name = call.function.name;
          if (typeof call?.function?.arguments === "string") current.arguments += call.function.arguments;
          state.toolCalls.set(index, current);
        };

        body.setEncoding("utf8");
        let buffer = "";
        body.on("data", (chunk) => {
          buffer += chunk;
          buffer = parseSse(buffer, (data) => {
            state.events++;
            if (data === "[DONE]") {
              state.seenDone = true;
              return;
            }

            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              return;
            }

            if (parsed?.["x-model"]) state.xModel = parsed["x-model"];
            if (parsed?.error) state.error = parsed.error;

            const choice = parsed?.choices?.[0];
            if (choice?.finish_reason) state.finishReasons.push(choice.finish_reason);

            const delta = choice?.delta || {};
            if (typeof delta?.content === "string") state.content += delta.content;

            if (Array.isArray(delta?.tool_calls)) {
              for (const call of delta.tool_calls) upsertToolCall(call);
            }

            if (delta?.function_call) {
              upsertToolCall({
                index: 0,
                id: undefined,
                type: "function",
                function: {
                  name: delta.function_call.name,
                  arguments: delta.function_call.arguments,
                },
              });
            }
          });
        });

        body.on("end", () => {
          if (state.error) {
            const msg =
              state.error?.message ||
              state.error?.error?.message ||
              "Upstream stream included an error event";
            const err = Object.assign(new Error(msg), { error: state.error, state });
            reject(err);
            return;
          }
          resolve(state);
        });
        body.on("error", reject);
      }
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.write(payload);
    req.end();
  });

const safeJsonParse = (text) => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err };
  }
};

const run = async () => {
  console.log(`→ Base: ${baseUrl}${endpointPrimary}`);
  console.log(`→ Model: ${model}`);
  console.log(`→ Tests: ${tests.join(", ")}`);

  const failures = [];

  for (const test of tests) {
    if (test === "basic") {
      console.log(`\n=== basic ===`);
      console.log(`Prompt: ${prompt}`);
      const res = await streamChatCompletion(
        {
          model,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        },
        { label: "basic" }
      );

      if (raw) continue;

      console.log(res.xModel ? `Upstream model: ${res.xModel}` : "Upstream model: (unknown)");
      console.log(res.content.trim() ? res.content.trim() : "(no streamed content)");
      if (!res.content.trim()) failures.push({ test: "basic", reason: "empty content" });
      continue;
    }

    if (test === "nonstream" || test === "non-stream") {
      console.log(`\n=== non-streaming ===`);
      console.log(`Prompt: ${prompt}`);
      const res = await fetch(new URL(endpointPrimary, baseUrl).toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept-encoding": "br, gzip, deflate, identity",
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        failures.push({ test: "nonstream", reason: `HTTP ${res.status}: ${errText || res.statusText}` });
        continue;
      }

      const data = await res.json();

      if (raw) {
        console.log(`\n--- nonstream (raw response) ---`);
        console.log(JSON.stringify(data, null, 2));
        continue;
      }

      console.log(data["x-model"] ? `Upstream model: ${data["x-model"]}` : "Upstream model: (unknown)");
      const content = data.choices?.[0]?.message?.content || "";
      console.log(content.trim() ? content.trim() : "(no content)");
      if (!content.trim()) failures.push({ test: "nonstream", reason: "empty content" });
      continue;
    }

    if (test === "tools" || test === "tool_calls" || test === "tool-calls") {
      console.log(`\n=== tool calls ===`);
      const toolName = "add";
      const res = await streamChatCompletion(
        {
          model,
          stream: true,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You are a tool-using assistant. When a function is provided, call it instead of doing arithmetic yourself.",
            },
            { role: "user", content: "Compute 230 + 19. Call the tool with integers a and b." },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: toolName,
                description: "Add two integers and return the sum.",
                parameters: {
                  type: "object",
                  properties: {
                    a: { type: "integer" },
                    b: { type: "integer" },
                  },
                  required: ["a", "b"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: toolName } },
        },
        { label: "tool_calls" }
      ).catch((err) => {
        failures.push({ test: "tool_calls", reason: err.message });
        return null;
      });

      if (!res) continue;
      if (raw) continue;

      console.log(res.xModel ? `Upstream model: ${res.xModel}` : "Upstream model: (unknown)");

      const calls = [...res.toolCalls.values()].sort((a, b) => a.index - b.index);
      if (!calls.length) {
        failures.push({ test: "tool_calls", reason: "no tool_calls seen in stream" });
        continue;
      }

      for (const call of calls) {
        console.log(`Tool: ${call.name || "(unnamed)"} (index ${call.index})`);
        const parsedArgs = safeJsonParse(call.arguments || "");
        if (parsedArgs.ok) console.log(`Args: ${JSON.stringify(parsedArgs.value)}`);
        else console.log(`Args (raw): ${call.arguments || ""}`);

        if (call.name !== toolName) failures.push({ test: "tool_calls", reason: `unexpected tool name '${call.name}'` });
        if (!parsedArgs.ok) failures.push({ test: "tool_calls", reason: "tool args are not valid JSON" });
      }

      if (res.content.trim()) {
        console.log(`Assistant content (unexpected): ${res.content.trim()}`);
      }
      continue;
    }

    if (test === "structured" || test === "structured_output" || test === "structured-outputs") {
      console.log(`\n=== structured outputs ===`);
      const basePayload = {
        model,
        stream: true,
        temperature: 0,
        messages: [
          {
            role: "user",
            content:
              'Return exactly this JSON (and only JSON): {"name":"Aria","lucky_number":7,"valid":true}',
          },
        ],
      };

      let res = null;
      try {
        res = await streamChatCompletion(
          {
            ...basePayload,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "ExampleResponse",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    lucky_number: { type: "integer" },
                    valid: { type: "boolean" },
                  },
                  required: ["name", "lucky_number", "valid"],
                  additionalProperties: false,
                },
              },
            },
          },
          { label: "structured(json_schema)" }
        );
      } catch (err) {
        console.warn(`json_schema not accepted (${err?.message}); retrying with json_object...`);
      }

      if (!res) {
        try {
          res = await streamChatCompletion(
            {
              ...basePayload,
              response_format: { type: "json_object" },
            },
            { label: "structured(json_object)" }
          );
        } catch (err) {
          failures.push({ test: "structured", reason: err.message });
          continue;
        }
      }

      if (raw) continue;

      console.log(res.xModel ? `Upstream model: ${res.xModel}` : "Upstream model: (unknown)");
      const text = res.content.trim();
      if (!text) {
        failures.push({ test: "structured", reason: "empty content" });
        continue;
      }

      const parsed = safeJsonParse(text);
      if (!parsed.ok) {
        failures.push({ test: "structured", reason: "output is not valid JSON" });
        console.log(text);
        continue;
      }

      if (
        typeof parsed.value?.name !== "string" ||
        typeof parsed.value?.lucky_number !== "number" ||
        typeof parsed.value?.valid !== "boolean"
      ) {
        failures.push({ test: "structured", reason: "output JSON missing expected fields/types" });
      }

      console.log(JSON.stringify(parsed.value, null, 2));
      continue;
    }

    failures.push({ test, reason: "unknown test name" });
  }

  if (failures.length) {
    console.error("\n✗ Some tests failed:");
    for (const f of failures) console.error(`- ${f.test}: ${f.reason}`);
    process.exitCode = 1;
  } else {
    console.log("\n✓ All tests passed");
  }
};

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
