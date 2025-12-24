<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { computed } from "vue";

const { data, pending, refresh } = await useFetch("/api/config");

const metaGrouped = computed(() => {
  if (!data.value?.meta) return [];
  const groups: Record<string, any[]> = {};
  for (const row of data.value.meta) {
    if (!groups[row.meta]) groups[row.meta] = [];
    groups[row.meta].push(row);
  }
  return Object.entries(groups).map(([meta, rows]) => ({ meta, rows }));
});

const stats = computed(() => {
  const providers = data.value?.providers?.length ?? 0;
  const searchProviders = data.value?.searchProviders?.length ?? 0;
  const models = data.value?.models?.length ?? 0;
  const meta = metaGrouped.value.length;
  return [
    { label: "Providers", value: providers, icon: "ph:plugs-connected", accent: "from-primary-500 to-fuchsia-500" },
    { label: "Search Providers", value: searchProviders, icon: "ph:globe-simple", accent: "from-violet-400 to-primary-500" },
    { label: "Models", value: models, icon: "ph:brain", accent: "from-indigo-400 to-primary-500" },
    { label: "Meta Targets", value: meta, icon: "ph:arrows-merge", accent: "from-primary-400 to-primary-500" },
  ];
});

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

const minutesByWindowKey: Record<string, number> = {
  per_minute: 1,
  per_hour: 60,
  per_day: 60 * 24,
  per_month: 60 * 24 * 30,
  tokens_per_minute: 1,
  tokens_per_hour: 60,
  tokens_per_day: 60 * 24,
  tokens_per_month: 60 * 24 * 30,
};

const minPositive = (values: Array<number | null | undefined>) => {
  const filtered = values
    .map((v) => (v === null || v === undefined ? null : Number(v)))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!filtered.length) return null;
  return Math.min(...filtered);
};

const capPerMinute = (model: any, keys: readonly { key: string }[]) => {
  const candidates = keys.map(({ key }) => {
    const v = Number(model?.[key] ?? 0);
    if (!v) return null;
    const minutes = minutesByWindowKey[key] ?? 0;
    if (!minutes) return null;
    return v / minutes;
  });
  return minPositive(candidates);
};

const maxLoadByModelId = computed(() => {
  const models = data.value?.models ?? [];
  const usage = data.value?.usage ?? [];
  const usageMap = new Map((usage as any[]).map((u) => [u.model_id, u]));
  const out = new Map<number, number>();

  for (const model of models as any[]) {
    const row = usageMap.get(model.id) ?? {};
    let max = 0;

    for (const def of requestDefs) {
      const limit = Number(model?.[def.key] ?? 0);
      if (!limit) continue;
      const used = Number(row?.[def.usedKey] ?? 0);
      max = Math.max(max, (used / limit) * 100);
    }

    for (const def of tokenDefs) {
      const limit = Number(model?.[def.key] ?? 0);
      if (!limit) continue;
      const used = Number(row?.[def.usedKey] ?? 0);
      max = Math.max(max, (used / limit) * 100);
    }

    out.set(model.id, max);
  }

  return out;
});

const indicatorClass = (pct: number) => {
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 80) return "bg-amber-500";
  if (pct > 0) return "bg-primary-500";
  return "bg-slate-300";
};

const basisLabel = (basis: "requests" | "tokens") =>
  basis === "tokens" ? "Sized by tokens/min" : "Sized by req/min";

const metaRoutes = computed(() => {
  const models = new Map((data.value?.models ?? []).map((m: any) => [m.id, m]));
  return metaGrouped.value.map((group: any) => {
    const rawTargets = (group.rows ?? []).map((row: any) => {
      const model = models.get(row.model_id);
      const maxLoad = maxLoadByModelId.value.get(row.model_id) ?? 0;
      const providerId = model?.provider_id ?? row.provider_id;
      const name = model?.name ?? row.name;
      const label = `${providerId}/${name}`;
      const reqCap = capPerMinute(model, requestDefs);
      const tokenCap = capPerMinute(model, tokenDefs);
      return {
        model_id: row.model_id,
        provider_id: providerId,
        name,
        label,
        supports_images: Boolean(model?.supports_images),
        maxLoad,
        reqCap,
        tokenCap,
      };
    });

    const tokenCoverage = rawTargets.filter((t: any) => (t.tokenCap ?? 0) > 0).length;
    const reqCoverage = rawTargets.filter((t: any) => (t.reqCap ?? 0) > 0).length;

    const basis: "requests" | "tokens" =
      tokenCoverage === rawTargets.length
        ? "tokens"
        : reqCoverage === rawTargets.length
          ? "requests"
          : tokenCoverage > reqCoverage
            ? "tokens"
            : "requests";

    const targets = rawTargets.map((t: any) => {
      const cap = basis === "tokens" ? t.tokenCap : t.reqCap;
      const capacity = typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? cap : 0.05;
      return { ...t, capacity };
    });

    return { meta: group.meta, targets, basis };
  });
});
</script>

<template>
  <UContainer class="py-10 space-y-8">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-sm text-slate-500">Operational cockpit</p>
        <h1 class="text-3xl font-bold text-slate-900">Usage, limits & routing</h1>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="ghost" icon="ph:arrows-clockwise" :loading="pending" @click="refresh">
          Refresh
        </UButton>
        <UButton color="primary" icon="ph:arrow-right" to="/providers">Open providers</UButton>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="item in stats"
        :key="item.label"
        class="relative overflow-hidden rounded-2xl border border-primary-200 px-6 py-4"
      >
        <div class="absolute inset-0 opacity-40"></div>
        <div class="relative flex items-center justify-between">
          <div class="space-y-1">
            <p class="text-xs uppercase tracking-wide text-slate-500">{{ item.label }}</p>
            <p class="text-3xl font-semibold text-slate-900">{{ item.value }}</p>
          </div>
          <div class="h-10 w-10 rounded-xl bg-primary-100 grid place-items-center text-primary-600">
            <UIcon :name="item.icon" class="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>

    <UCard class="border-primary-100 bg-white">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Meta routing</h2>
            <p class="text-sm text-slate-500">Targets are evaluated left → right until a non-rate-limited match is found</p>
          </div>
          <UButton color="primary" variant="soft" icon="ph:arrows-merge" to="/meta">Edit</UButton>
        </div>
      </template>

      <div v-if="metaRoutes.length" class="space-y-4">
        <div
          v-for="route in metaRoutes"
          :key="route.meta"
          class="rounded-2xl border border-primary-100 bg-primary-50/40 p-4"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">Meta model</p>
              <p class="text-base font-semibold text-slate-900">{{ route.meta }}</p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge color="neutral" variant="subtle">{{ route.targets.length }} targets</UBadge>
              <UBadge color="primary" variant="subtle">{{ basisLabel(route.basis) }}</UBadge>
            </div>
          </div>

          <div class="mt-3 flex justify-center text-slate-400">
            <UIcon name="ph:caret-down" class="h-4 w-4" />
          </div>

          <div class="mt-2">
            <div class="overflow-hidden rounded-2xl border border-primary-200 bg-white">
              <div class="flex h-14 w-full">
                <div
                  v-for="(target, idx) in route.targets"
                  :key="target.model_id"
                  class="relative h-full"
                  :style="{ flexGrow: target.capacity, flexBasis: '0%' }"
                  :class="idx < route.targets.length - 1 ? 'border-r border-primary-200' : ''"
                >
                  <div
                    class="absolute inset-y-0 left-0 bg-primary-100/70"
                    :style="{ width: Math.min(100, Math.max(0, target.maxLoad)).toFixed(0) + '%' }"
                  />
                  <div class="relative flex h-full items-center justify-center gap-2 px-2 min-w-0">
                    <span class="h-2 w-2 rounded-full shrink-0" :class="indicatorClass(target.maxLoad)" />
                    <div class="min-w-0 text-center leading-tight">
                      <div class="flex items-center justify-center gap-1 min-w-0">
                        <span class="truncate text-xs font-semibold text-slate-800">{{ target.name }}</span>
                        <UIcon
                          v-if="target.supports_images"
                          name="ph:image-square"
                          class="h-3.5 w-3.5 text-primary-600 shrink-0"
                        />
                      </div>
                      <div class="truncate text-[10px] text-slate-500">{{ target.provider_id }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p class="mt-2 text-[11px] text-slate-500 text-center">
            Segment width reflects configured caps (normalized per minute). Fill indicates current load vs cap.
          </p>
        </div>
      </div>

      <div v-else class="text-sm text-slate-500">No meta models configured yet.</div>
    </UCard>

    <UAlert v-if="pending" title="Refreshing" description="Fetching the latest config…" color="primary" />
  </UContainer>
</template>
