<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { computed, reactive, ref, watch } from "vue";

const { data, refresh, pending } = await useFetch("/api/config");

const OPENROUTER_PREFIX = "openrouter-";
const OPENROUTER_AUTO_PROVIDER_ID = "openrouter";
const PROVIDER_KIND_OPENAI = "openai";
const PROVIDER_KIND_OPENROUTER = "openrouter";

const providers = computed(() => data.value?.providers ?? []);
const openaiProviders = computed(() => providers.value.filter((p: any) => (p?.kind || PROVIDER_KIND_OPENAI) === PROVIDER_KIND_OPENAI && !String(p.id || "").startsWith(OPENROUTER_PREFIX)));
const openRouterProvider = computed(() => providers.value.find((p: any) => (p?.kind || PROVIDER_KIND_OPENAI) === PROVIDER_KIND_OPENROUTER) || null);
const providerLabel = (id: string) => providers.value.find((p: any) => p.id === id)?.display_name || id;
const providerOptions = computed(() => openaiProviders.value.map((p: any) => ({ label: p.display_name || p.id, value: p.id })));
const catalogIsOpenRouter = computed(() => parsedCatalog.value?.kind === PROVIDER_KIND_OPENROUTER);
const selectedOpenRouterModelLabel = computed(() => parsedCatalog.value?.model || parsedCatalog.value?.name || selectedOpenRouterModel.value || "");
const parsedCatalog = computed(() => {
  const raw = selectedCatalogModel.value;
  if (!raw) return null;
  const val = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!val || typeof val !== "object") return val;
  if ("value" in val && (val as any).value) return (val as any).value;
  return val;
});

const normalizeOpenRouterProvider = (val: any) => {
  if (val === null || val === undefined || val === "") return "auto";
  const raw = typeof val === "object" ? val.value || val.slug || val.id || "auto" : String(val);
  const stripped = raw.replace(/^openrouter-/, "");
  if (stripped.includes("--")) return stripped.split("--")[0];
  if (stripped.includes("/")) return stripped.split("/")[0];
  return stripped;
};

const modelForm = reactive({
  provider_id: "",
  openrouter_provider: "auto",
  name: "",
  supports_images: false,
  per_minute: "",
  per_hour: "",
  per_day: "",
  per_month: "",
  tokens_per_minute: "",
  tokens_per_hour: "",
  tokens_per_day: "",
  tokens_per_month: "",
});

const selectedProviderKind = ref<string>(openaiProviders.value.length ? PROVIDER_KIND_OPENAI : PROVIDER_KIND_OPENROUTER);
const selectedProvider = ref("");
const editingModelId = ref<number | null>(null);
const selectedProviderIsOpenRouter = computed(() => selectedProviderKind.value === PROVIDER_KIND_OPENROUTER || selectedProvider.value === OPENROUTER_AUTO_PROVIDER_ID || selectedProvider.value?.startsWith(OPENROUTER_PREFIX));
const kindLockedFromCatalog = ref(false);
const providerModels = reactive<Record<string, { pending: boolean; error: string | null; data: any[]; tried?: boolean }>>({});
const openRouterModels = reactive<{
  pending: boolean;
  error: string | null;
  models: { id?: string; name?: string }[];
  fetchedAt: string | null;
}>({
  pending: false,
  error: null,
  models: [],
  fetchedAt: null,
});
const openRouterEndpoints = reactive<Record<
  string,
  {
    pending: boolean;
    error: string | null;
    endpoints: any[];
    providers: { id: string; slug: string; name: string; provider_name?: string | null; tag?: string | null }[];
    fetchedAt: string | null;
  }
>>({});
const selectedOpenRouterModel = ref("");
const selectedOpenRouterProvider = ref("auto");
const selectedCatalogModel = ref<any>(null);
const openRouterProviderOptions = computed(() => {
  const modelId = selectedOpenRouterModel.value;
  const providersForModel = modelId ? openRouterEndpoints[modelId]?.providers ?? [] : [];
  return [
    { label: "Auto (let OpenRouter pick)", value: "auto" },
    ...providersForModel.map((p) => ({
      label: `${p.name || p.provider_name || p.slug} (${p.id || p.slug})`,
      value: normalizeOpenRouterProvider(p.slug || p.id),
    })),
  ];
});

const modelCatalogOptions = computed(() => {
  const options: { label: string; value: any; kind: string }[] = [];

  Object.entries(providerModels).forEach(([providerId, payload]) => {
    if (!payload?.data?.length) return;
    options.push(
      ...payload.data.map((m: any) => ({
        label: `${providerLabel(providerId)} · ${m.id || m.name}`,
        value: { provider_id: providerId, name: m.id || m.name, kind: PROVIDER_KIND_OPENAI },
        kind: PROVIDER_KIND_OPENAI,
      }))
    );
  });

  options.push(
    ...openRouterModels.models.map((m) => ({
      label: `OpenRouter · ${m.name || m.id}`,
      value: { provider_id: OPENROUTER_AUTO_PROVIDER_ID, name: m.id || m.name, model: m.id, kind: PROVIDER_KIND_OPENROUTER },
      kind: PROVIDER_KIND_OPENROUTER,
    }))
  );

  return options.sort((a, b) => a.label.localeCompare(b.label));
});
const hasSelectedModel = computed(() => Boolean(parsedCatalog.value || selectedOpenRouterModel.value || selectedCatalogModel.value));
const parseOpenRouterModel = (id: string) => {
  const clean = id.includes(":") ? id.split(":")[0] : id;
  const [author, ...rest] = clean.split("/");
  const slug = rest.join("/");
  return { author, slug };
};

const loadOpenRouterModels = async () => {
  if (openRouterModels.pending) return;

  openRouterModels.pending = true;
  openRouterModels.error = null;
  try {
    const res = await $fetch<{ models: { id?: string; name?: string }[]; fetched_at?: string }>("/api/openrouter/models");
    openRouterModels.models = res?.models ?? [];
    openRouterModels.fetchedAt = res?.fetched_at ?? null;
    if (!selectedOpenRouterModel.value && openRouterModels.models.length) {
      selectedOpenRouterModel.value = openRouterModels.models[0].id || "";
    }
    if (selectedProvider.value === OPENROUTER_AUTO_PROVIDER_ID) {
      fetchProviderModels(OPENROUTER_AUTO_PROVIDER_ID, { skipIfFetched: false });
    }
  } catch (err: any) {
    openRouterModels.error =
      err?.data?.statusMessage || err?.data?.message || err?.message || "Failed to load OpenRouter models";
  } finally {
    openRouterModels.pending = false;
  }
};

const loadOpenRouterEndpoints = async (modelId: string) => {
  if (!modelId) return;
  const { author, slug } = parseOpenRouterModel(modelId);
  if (!openRouterEndpoints[modelId]) {
    openRouterEndpoints[modelId] = {
      pending: false,
      error: null,
      endpoints: [],
      providers: [],
      fetchedAt: null,
    };
  }
  if (openRouterEndpoints[modelId].pending) return;

  openRouterEndpoints[modelId].pending = true;
  openRouterEndpoints[modelId].error = null;
  try {
    const res = await $fetch<{
      endpoints: any[];
      providers: { id: string; slug: string; name: string; provider_name?: string | null; tag?: string | null }[];
      fetched_at?: string;
    }>(`/api/openrouter/models/${encodeURIComponent(author)}/${encodeURIComponent(slug)}/endpoints`);
    openRouterEndpoints[modelId].endpoints = res?.endpoints ?? [];
    openRouterEndpoints[modelId].providers = res?.providers ?? [];
    openRouterEndpoints[modelId].fetchedAt = res?.fetched_at ?? null;
  } catch (err: any) {
    openRouterEndpoints[modelId].error =
      err?.data?.statusMessage || err?.data?.message || err?.message || "Failed to load OpenRouter endpoints";
  } finally {
    openRouterEndpoints[modelId].pending = false;
  }
};

const fetchProviderModels = async (providerId: string, opts?: { skipIfFetched?: boolean }) => {
  if (!providerId) return;
  const provider = providers.value.find((p: any) => p.id === providerId);
  if (providerId === OPENROUTER_AUTO_PROVIDER_ID) {
    providerModels[providerId] = {
      pending: false,
      error: null,
      data: openRouterModels.models.map((m) => ({ id: m.id, name: m.name })),
      tried: true,
    };
    return;
  }
  if (!provider?.base_url) return;

  if (!providerModels[providerId]) {
    providerModels[providerId] = { pending: false, error: null, data: [], tried: false };
  }

  if (opts?.skipIfFetched && providerModels[providerId].tried) return;
  if (providerModels[providerId].pending) return;

  providerModels[providerId].pending = true;
  providerModels[providerId].error = null;
  providerModels[providerId].tried = true;

  try {
    if (providerId.startsWith(OPENROUTER_PREFIX)) {
      const matches = Object.entries(openRouterEndpoints).filter(([, val]) =>
        val.providers.some((p) => p.id === providerId)
      );
      if (!matches.length) {
        providerModels[providerId].error = "Select an OpenRouter model and fetch its endpoints to list provider IDs";
        return;
      }
      providerModels[providerId].data = matches.flatMap(([modelId, val]) =>
        val.providers
          .filter((p) => p.id === providerId)
          .map((p) => ({ id: `${p.id} (${modelId})` }))
      );
      return;
    }

    const url = `${provider.base_url.replace(/\/+$/, "")}/models`;
    const res = await $fetch<any>(url, {
      headers: provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : undefined,
    });
    const list = Array.isArray(res?.data) ? res.data : res?.models ?? [];
    providerModels[providerId].data = list;
  } catch (err: any) {
    providerModels[providerId].error = err?.data?.statusMessage || err?.data?.message || err?.message || "Failed to fetch models";
  } finally {
    providerModels[providerId].pending = false;
  }
};

watch(
  providers,
  (list) => {
    if (!selectedProvider.value) {
      if (selectedProviderKind.value === PROVIDER_KIND_OPENAI && openaiProviders.value.length) {
        selectedProvider.value = openaiProviders.value[0].id;
      } else if (openRouterProvider.value) {
        selectedProvider.value = openRouterProvider.value.id;
      }
    }
  },
  { immediate: true }
);

watch(
  selectedProviderKind,
  (kind) => {
    if (kind === PROVIDER_KIND_OPENAI && openaiProviders.value.length) {
      selectedProvider.value = openaiProviders.value[0].id;
    } else if (kind === PROVIDER_KIND_OPENROUTER && openRouterProvider.value) {
      selectedProvider.value = openRouterProvider.value.id;
    }
  },
  { immediate: true }
);

watch(
  selectedProvider,
  (id) => {
    if (!id) return;
    const provider = providers.value.find((p: any) => p.id === id);
    const inferredKind = provider?.kind || (id === OPENROUTER_AUTO_PROVIDER_ID || id.startsWith(OPENROUTER_PREFIX)
      ? PROVIDER_KIND_OPENROUTER
      : PROVIDER_KIND_OPENAI);
    if (!kindLockedFromCatalog.value) {
      selectedProviderKind.value = inferredKind;
    }
    modelForm.provider_id = id;
    if (selectedProviderKind.value === PROVIDER_KIND_OPENROUTER) {
      if (selectedOpenRouterModel.value) {
        loadOpenRouterEndpoints(selectedOpenRouterModel.value);
      }
    }
    fetchProviderModels(id, { skipIfFetched: true });
  },
  { immediate: true }
);

watch(
  selectedOpenRouterModel,
  (model) => {
    if (model) {
      loadOpenRouterEndpoints(model);
      modelForm.openrouter_provider = "auto";
      selectedOpenRouterProvider.value = "auto";
    }
  },
  { immediate: true }
);

watch(selectedOpenRouterProvider, (provider) => {
  modelForm.openrouter_provider = normalizeOpenRouterProvider(provider);
});

watch(selectedCatalogModel, (value) => {
  const parsed = parsedCatalog.value;
  if (!parsed) {
    modelForm.name = "";
    selectedOpenRouterModel.value = "";
    selectedOpenRouterProvider.value = "auto";
    modelForm.openrouter_provider = "auto";
    kindLockedFromCatalog.value = false;
    return;
  }

  if (parsed.kind === PROVIDER_KIND_OPENAI) {
    modelForm.name = parsed.name;
    selectedProviderKind.value = PROVIDER_KIND_OPENAI;
    kindLockedFromCatalog.value = true;
    selectedProvider.value = parsed.provider_id;
    selectedOpenRouterModel.value = "";
    selectedOpenRouterProvider.value = "auto";
    modelForm.openrouter_provider = "auto";
  } else {
    modelForm.name = parsed.name;
    selectedProviderKind.value = PROVIDER_KIND_OPENROUTER;
    kindLockedFromCatalog.value = true;
    selectedProvider.value = OPENROUTER_AUTO_PROVIDER_ID;
    selectedOpenRouterModel.value = parsed.model || parsed.name;
    if (selectedOpenRouterModel.value && !openRouterModels.models.some((m) => m.id === selectedOpenRouterModel.value)) {
      openRouterModels.models.push({ id: selectedOpenRouterModel.value, name: parsed.name || selectedOpenRouterModel.value });
    }
    selectedOpenRouterProvider.value = "auto";
    modelForm.openrouter_provider = "auto";
  }
});

loadOpenRouterModels();

const useSuggestion = (name: string) => {
  modelForm.name = name;
};

const toFormNumber = (value: any) => (value === null || value === undefined ? "" : String(value));

const resetForm = () => {
  modelForm.provider_id = "";
  modelForm.openrouter_provider = "auto";
  modelForm.name = "";
  modelForm.supports_images = false;
  modelForm.per_minute = "";
  modelForm.per_hour = "";
  modelForm.per_day = "";
  modelForm.per_month = "";
  modelForm.tokens_per_minute = "";
  modelForm.tokens_per_hour = "";
  modelForm.tokens_per_day = "";
  modelForm.tokens_per_month = "";
  selectedProviderKind.value = openaiProviders.value.length ? PROVIDER_KIND_OPENAI : PROVIDER_KIND_OPENROUTER;
  selectedProvider.value = "";
  selectedCatalogModel.value = null;
  selectedOpenRouterModel.value = "";
  selectedOpenRouterProvider.value = "auto";
  kindLockedFromCatalog.value = false;
  editingModelId.value = null;
};

const editModel = (row: any) => {
  editingModelId.value = row?.id ?? null;
  selectedProvider.value = row?.provider_id ?? "";
  modelForm.openrouter_provider = row?.openrouter_provider || "auto";
  selectedOpenRouterProvider.value = row?.openrouter_provider || "auto";
  modelForm.provider_id = row?.provider_id ?? "";
  modelForm.name = row?.name ?? "";
  modelForm.supports_images = Boolean(row?.supports_images);
  modelForm.per_minute = toFormNumber(row?.per_minute);
  modelForm.per_hour = toFormNumber(row?.per_hour);
  modelForm.per_day = toFormNumber(row?.per_day);
  modelForm.per_month = toFormNumber(row?.per_month);
  modelForm.tokens_per_minute = toFormNumber(row?.tokens_per_minute);
  modelForm.tokens_per_hour = toFormNumber(row?.tokens_per_hour);
  modelForm.tokens_per_day = toFormNumber(row?.tokens_per_day);
  modelForm.tokens_per_month = toFormNumber(row?.tokens_per_month);

  if (row?.provider_id === OPENROUTER_AUTO_PROVIDER_ID || String(row?.provider_id || "").startsWith(OPENROUTER_PREFIX)) {
    selectedProviderKind.value = PROVIDER_KIND_OPENROUTER;
    kindLockedFromCatalog.value = true;
    selectedOpenRouterModel.value = row?.name || selectedOpenRouterModel.value;
    if (String(row?.provider_id || "").startsWith(OPENROUTER_PREFIX) && !row?.openrouter_provider) {
      selectedOpenRouterProvider.value = row?.provider_id?.replace(OPENROUTER_PREFIX, "") || "auto";
      modelForm.openrouter_provider = selectedOpenRouterProvider.value;
    }
  }
};

const submitModel = async () => {
  const payload = {
    ...modelForm,
    openrouter_provider: normalizeOpenRouterProvider(modelForm.openrouter_provider),
  } as typeof modelForm;

  await $fetch("/api/models", { method: "POST", body: payload });
  await refresh();
  resetForm();
};

const deleteModel = async (id: number) => {
  if (!id) return;
  await $fetch(`/api/models/${id}`, { method: "DELETE" });
  await refresh();
  if (editingModelId.value === id) resetForm();
};
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-slate-500">Catalog</p>
        <h1 class="text-2xl font-semibold text-slate-900">Models</h1>
      </div>
      <UButton color="neutral" variant="ghost" icon="ph:arrows-clockwise" :loading="pending" @click="refresh">Refresh</UButton>
    </div>

    <UCard class="border-primary-100 bg-white">
      <div class="grid gap-6 lg:grid-cols-[420px,1fr]">
        <div class="space-y-4">
          <UForm :state="modelForm" @submit.prevent="submitModel" class="space-y-3">

            <div class="space-y-3">
              <UFormField label="Select model" name="catalog" required>
                <USelectMenu
                  v-model="selectedCatalogModel"
                  :items="modelCatalogOptions"
                  searchable
                  searchable-placeholder="Search models across providers"
                  placeholder="Search discovered models"
                  clearable
                />
              </UFormField>

              <div v-if="hasSelectedModel" class="flex flex-wrap gap-2 text-xs text-slate-600">
                <UBadge color="primary" variant="soft">
                  {{ modelForm.name || 'Selected model' }}
                </UBadge>
              </div>
            </div>

            <div v-if="hasSelectedModel" class="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div v-if="selectedProviderKind === PROVIDER_KIND_OPENAI" class="lg:col-span-2">
                <p class="text-sm text-slate-700">Provider</p>
                <p class="text-xs text-slate-500">{{ providerLabel(selectedProvider || modelForm.provider_id) }}</p>
              </div>

              <div v-else class="lg:col-span-2 space-y-2">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <template v-if="catalogIsOpenRouter">
                    <div class="space-y-1">
                      <p class="text-sm text-slate-700">OpenRouter model</p>
                      <p class="text-xs text-slate-500 font-mono">{{ selectedOpenRouterModelLabel }}</p>
                    </div>
                  </template>
                  <template v-else>
                    <UFormField label="OpenRouter model" name="openrouter_model" required>
                      <USelect
                        v-model="selectedOpenRouterModel"
                        :items="openRouterModels.models.map((m) => ({ label: m.name || m.id, value: m.id }))"
                        placeholder="Select OpenRouter model"
                        :loading="openRouterModels.pending"
                      />
                    </UFormField>
                  </template>
                  <UFormField label="OpenRouter provider" name="openrouter_provider">
                    <USelectMenu
                      v-model="selectedOpenRouterProvider"
                      :items="openRouterProviderOptions"
                      searchable
                      placeholder="Auto or choose a provider"
                      :disabled="!selectedOpenRouterModel"
                    />
                  </UFormField>
                </div>
                <div class="flex items-center gap-2 text-xs text-slate-600">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="ph:cloud-arrow-down"
                    :loading="selectedOpenRouterModel && openRouterEndpoints[selectedOpenRouterModel]?.pending"
                    :disabled="!selectedOpenRouterModel"
                    @click="selectedOpenRouterModel && loadOpenRouterEndpoints(selectedOpenRouterModel)"
                  >
                    Refresh providers
                  </UButton>
                  <span v-if="selectedOpenRouterModel && openRouterEndpoints[selectedOpenRouterModel]?.fetchedAt">
                    Updated {{ new Date(openRouterEndpoints[selectedOpenRouterModel].fetchedAt || '').toLocaleTimeString() }}
                  </span>
                  <span v-else class="text-slate-400">Choose a model to load providers.</span>
                </div>
              </div>
            </div>

            <UAlert
              v-if="editingModelId"
              color="primary"
              variant="subtle"
              title="Editing model"
              :description="`Updating limits/capabilities for ${modelForm.provider_id}/${modelForm.name} (#${editingModelId})`"
            />

            <div class="rounded-lg border border-primary-100 bg-white p-3">
              <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <UCheckbox v-model="modelForm.supports_images" />
                <span>Supports image inputs</span>
              </label>
              <p class="mt-1 text-xs text-slate-500">When a conversation includes images, routing only selects models with this enabled.</p>
            </div>

            <div class="rounded-lg border border-primary-100 bg-primary-50/40 p-3 space-y-3">
              <p class="text-xs font-semibold text-slate-700">Request caps (requests)</p>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Per minute" name="per_minute">
                  <UInput v-model="modelForm.per_minute" type="number" placeholder="e.g. 60" />
                </UFormField>
                <UFormField label="Per hour" name="per_hour">
                  <UInput v-model="modelForm.per_hour" type="number" placeholder="e.g. 1000" />
                </UFormField>
                <UFormField label="Per day" name="per_day">
                  <UInput v-model="modelForm.per_day" type="number" placeholder="e.g. 20000" />
                </UFormField>
                <UFormField label="Per month" name="per_month">
                  <UInput v-model="modelForm.per_month" type="number" placeholder="e.g. 400000" />
                </UFormField>
              </div>
            </div>

            <div class="rounded-lg border border-primary-100 bg-primary-50/40 p-3 space-y-3">
              <p class="text-xs font-semibold text-slate-700">Token caps (tokens)</p>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Per minute" name="tokens_per_minute">
                  <UInput v-model="modelForm.tokens_per_minute" type="number" placeholder="e.g. 20000" />
                </UFormField>
                <UFormField label="Per hour" name="tokens_per_hour">
                  <UInput v-model="modelForm.tokens_per_hour" type="number" placeholder="e.g. 500000" />
                </UFormField>
                <UFormField label="Per day" name="tokens_per_day">
                  <UInput v-model="modelForm.tokens_per_day" type="number" placeholder="e.g. 2000000" />
                </UFormField>
                <UFormField label="Per month" name="tokens_per_month">
                  <UInput v-model="modelForm.tokens_per_month" type="number" placeholder="e.g. 50000000" />
                </UFormField>
              </div>
            </div>
            <div class="flex justify-end">
              <div class="flex items-center gap-2">
                <UButton v-if="editingModelId" color="neutral" variant="ghost" icon="ph:x" @click="resetForm">Cancel</UButton>
                <UButton type="submit" color="primary" icon="ph:floppy-disk">
                  {{ editingModelId ? 'Update Model' : 'Save Model' }}
                </UButton>
              </div>
            </div>
          </UForm>
        </div>
        <div>
          <UTable
            :data="data?.models ?? []"
            :columns="[
              { id: 'id', accessorKey: 'id', header: '#' },
              { id: 'provider_id', accessorKey: 'provider_id', header: 'Provider' },
              { id: 'openrouter_provider', accessorKey: 'openrouter_provider', header: 'OR provider' },
              { id: 'name', accessorKey: 'name', header: 'Name' },
              { id: 'supports_images', accessorKey: 'supports_images', header: 'Images' },
              { id: 'limits', accessorKey: 'limits', header: 'Req limits' },
              { id: 'token_limits', accessorKey: 'token_limits', header: 'Token limits' },
              { id: 'actions', accessorKey: 'actions', header: 'Actions' },
            ]"
            class="overflow-hidden rounded-xl border border-primary-100"
          >
            <template #supports_images-cell="{ row }">
              <UBadge :color="row.original.supports_images ? 'primary' : 'neutral'" variant="subtle">
                {{ row.original.supports_images ? 'Yes' : 'No' }}
              </UBadge>
            </template>
            <template #openrouter_provider-cell="{ row }">
              <span v-if="row.original.provider_id === OPENROUTER_AUTO_PROVIDER_ID">
                {{ normalizeOpenRouterProvider(row.original.openrouter_provider) }}
              </span>
              <span v-else>-</span>
            </template>
            <template #limits-cell="{ row }">
              <span class="font-mono text-xs">
                {{ row.original.per_minute ?? '-' }} / {{ row.original.per_hour ?? '-' }} / {{ row.original.per_day ?? '-' }} / {{ row.original.per_month ?? '-' }}
              </span>
            </template>
            <template #token_limits-cell="{ row }">
              <span class="font-mono text-xs">
                {{ row.original.tokens_per_minute ?? '-' }} / {{ row.original.tokens_per_hour ?? '-' }} / {{ row.original.tokens_per_day ?? '-' }} / {{ row.original.tokens_per_month ?? '-' }}
              </span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex items-center gap-2">
                <UButton size="xs" color="neutral" variant="ghost" icon="ph:pencil-simple" @click="editModel(row.original)">
                  Edit
                </UButton>
                <UButton size="xs" color="red" variant="ghost" icon="ph:trash" @click="deleteModel(row.original.id)">
                  Delete
                </UButton>
              </div>
            </template>
          </UTable>
        </div>
      </div>
    </UCard>
  </UContainer>
</template>
