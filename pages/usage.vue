<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { computed } from "vue";

type LimitKind = "requests" | "tokens";
type LimitWindow = { key: string; label: string; used: number; limit: number; pct: number; kind: LimitKind };
type LimitEntry = {
  model_id: number;
  label: string;
  supports_images: boolean;
  requestWindows: LimitWindow[];
  tokenWindows: LimitWindow[];
  maxLoad: number;
};

const { data, pending, refresh } = await useFetch("/api/config");

const requestDefs = [
  { key: "per_minute", usedKey: "requests_1m", label: "Req last minute" },
  { key: "per_hour", usedKey: "requests_1h", label: "Req last hour" },
  { key: "per_day", usedKey: "requests_1d", label: "Req last 24h" },
  { key: "per_month", usedKey: "requests_30d", label: "Req last 30d" },
] as const;

const tokenDefs = [
  { key: "tokens_per_minute", usedKey: "tokens_1m", label: "Tokens last minute" },
  { key: "tokens_per_hour", usedKey: "tokens_1h", label: "Tokens last hour" },
  { key: "tokens_per_day", usedKey: "tokens_1d", label: "Tokens last 24h" },
  { key: "tokens_per_month", usedKey: "tokens_30d", label: "Tokens last 30d" },
] as const;

const clampPercent = (value: number) => Math.min(999, Math.max(0, value));

const limitLoad = computed<LimitEntry[]>(() => {
  const usage = (data.value?.usage ?? []) as any[];
  const models = (data.value?.models ?? []) as any[];
  if (!models.length) return [];

  const usageMap = new Map(usage.map((row) => [row.model_id, row]));

  return models
    .map((model) => {
      const row = usageMap.get(model.id) ?? {};

      const requestWindows = requestDefs
        .map((def) => {
          const limit = Number(model?.[def.key] ?? 0);
          if (!limit) return null;
          const used = Number(row?.[def.usedKey] ?? 0);
          const pct = (used / limit) * 100;
          return { key: def.key, label: def.label, used, limit, pct, kind: "requests" } satisfies LimitWindow;
        })
        .filter((w): w is LimitWindow => Boolean(w));

      const tokenWindows = tokenDefs
        .map((def) => {
          const limit = Number(model?.[def.key] ?? 0);
          if (!limit) return null;
          const used = Number(row?.[def.usedKey] ?? 0);
          const pct = (used / limit) * 100;
          return { key: def.key, label: def.label, used, limit, pct, kind: "tokens" } satisfies LimitWindow;
        })
        .filter((w): w is LimitWindow => Boolean(w));

      if (!requestWindows.length && !tokenWindows.length) return null;

      const label = `${model.provider_id}/${model.name}`;
      const maxLoad = Math.max(0, ...requestWindows.map((w) => w.pct), ...tokenWindows.map((w) => w.pct));

      return {
        model_id: model.id,
        label,
        supports_images: Boolean(model.supports_images),
        requestWindows,
        tokenWindows,
        maxLoad,
      } satisfies LimitEntry;
    })
    .filter((entry): entry is LimitEntry => Boolean(entry))
    .sort((a, b) => b.maxLoad - a.maxLoad);
});
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-sm text-slate-500">Operational details</p>
        <h1 class="text-2xl font-semibold text-slate-900">Usage</h1>
        <p class="text-sm text-slate-500">Per-model load against configured request/token caps</p>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="ghost" icon="ph:arrows-clockwise" :loading="pending" @click="refresh">
          Refresh
        </UButton>
        <UButton color="primary" variant="soft" icon="ph:brain" to="/models">Edit models</UButton>
      </div>
    </div>

    <UCard class="border-primary-100 bg-white">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Limit load</h2>
            <p class="text-sm text-slate-500">Higher = closer to hitting a cap</p>
          </div>
          <UBadge color="primary" variant="subtle">Live</UBadge>
        </div>
      </template>

      <div v-if="limitLoad.length" class="grid gap-4 md:grid-cols-2">
        <div
          v-for="item in limitLoad"
          :key="item.model_id"
          class="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 shadow-sm"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">Model</p>
              <p class="font-semibold text-slate-900">{{ item.label }}</p>
              <div class="mt-1 flex items-center gap-2">
                <UBadge :color="item.supports_images ? 'primary' : 'neutral'" variant="subtle">
                  {{ item.supports_images ? 'Image-capable' : 'Text-only' }}
                </UBadge>
              </div>
            </div>
            <UBadge
              :color="item.maxLoad >= 100 ? 'error' : item.maxLoad >= 80 ? 'warning' : 'primary'"
              variant="subtle"
            >
              {{ clampPercent(item.maxLoad).toFixed(0) }}% load
            </UBadge>
          </div>

          <div class="mt-4 space-y-4">
            <div v-if="item.requestWindows.length" class="space-y-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Requests</p>
              <div v-for="win in item.requestWindows" :key="win.key" class="space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-slate-600">{{ win.label }}</span>
                  <span class="font-medium text-slate-900">
                    {{ clampPercent(win.pct).toFixed(0) }}%
                    <span class="text-slate-500">({{ win.used }} / {{ win.limit }})</span>
                  </span>
                </div>
                <div class="h-2 rounded-full bg-white/70">
                  <div
                    class="h-full rounded-full"
                    :class="win.pct >= 100 ? 'bg-rose-500' : win.pct >= 80 ? 'bg-amber-500' : 'bg-primary-500'"
                    :style="{ width: Math.min(100, clampPercent(win.pct)).toFixed(0) + '%' }"
                  />
                </div>
              </div>
            </div>

            <div v-if="item.tokenWindows.length" class="space-y-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tokens</p>
              <div v-for="win in item.tokenWindows" :key="win.key" class="space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-slate-600">{{ win.label }}</span>
                  <span class="font-medium text-slate-900">
                    {{ clampPercent(win.pct).toFixed(0) }}%
                    <span class="text-slate-500">({{ win.used }} / {{ win.limit }})</span>
                  </span>
                </div>
                <div class="h-2 rounded-full bg-white/70">
                  <div
                    class="h-full rounded-full"
                    :class="win.pct >= 100 ? 'bg-rose-500' : win.pct >= 80 ? 'bg-amber-500' : 'bg-primary-500'"
                    :style="{ width: Math.min(100, clampPercent(win.pct)).toFixed(0) + '%' }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="text-sm text-slate-500">
        No models have limits configured yet. Set caps in <NuxtLink to="/models" class="text-primary-600 hover:underline">/models</NuxtLink>.
      </div>
    </UCard>

    <UAlert v-if="pending" title="Refreshing" description="Fetching the latest config…" color="primary" />
  </UContainer>
</template>

