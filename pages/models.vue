<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { computed, reactive, ref, watch } from "vue";

const { data, refresh, pending } = await useFetch("/api/config");

const OPENROUTER_PREFIX = "openrouter-";
const providers = computed(() => data.value?.providers ?? []);
const providerOptions = computed(() => providers.value.map((p: any) => ({ label: p.display_name || p.id, value: p.id })));

const modelForm = reactive({
  provider_id: "",
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

const selectedProvider = ref("");
const editingModelId = ref<number | null>(null);
const selectedProviderIsOpenRouter = computed(() => selectedProvider.value?.startsWith(OPENROUTER_PREFIX));
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
    if (!selectedProvider.value && list?.length === 1) {
      selectedProvider.value = list[0].id;
    }
  },
  { immediate: true }
);

watch(
  selectedProvider,
  (id) => {
    modelForm.provider_id = id;
    if (id?.startsWith(OPENROUTER_PREFIX)) {
      if (selectedOpenRouterModel.value) {
        loadOpenRouterEndpoints(selectedOpenRouterModel.value);
      }
    }
    if (id) fetchProviderModels(id, { skipIfFetched: true });
  },
  { immediate: true }
);

watch(
  selectedOpenRouterModel,
  (model) => {
    if (model) loadOpenRouterEndpoints(model);
  },
  { immediate: true }
);

loadOpenRouterModels();

const useSuggestion = (name: string) => {
  modelForm.name = name;
};

const toFormNumber = (value: any) => (value === null || value === undefined ? "" : String(value));

const resetForm = () => {
  modelForm.provider_id = "";
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
  selectedProvider.value = "";
  editingModelId.value = null;
};

const editModel = (row: any) => {
  editingModelId.value = row?.id ?? null;
  selectedProvider.value = row?.provider_id ?? "";
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
};

const submitModel = async () => {
  await $fetch("/api/models", { method: "POST", body: modelForm });
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

    <UCard class="border-purple-100 bg-white">
      <div class="grid gap-6 lg:grid-cols-[420px,1fr]">
        <div class="space-y-4">
          <UForm :state="modelForm" @submit.prevent="submitModel" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Provider" name="provider_id" required>
                <USelect v-model="selectedProvider" :items="providerOptions" placeholder="Select provider" :disabled="Boolean(editingModelId)" />
              </UFormField>
              <UFormField label="Name" name="name" required>
                <UInput v-model="modelForm.name" placeholder="gpt-4o" :disabled="Boolean(editingModelId)" />
              </UFormField>
            </div>

            <UAlert
              v-if="editingModelId"
              color="primary"
              variant="subtle"
              title="Editing model"
              :description="`Updating limits/capabilities for ${modelForm.provider_id}/${modelForm.name} (#${editingModelId})`"
            />
            <UAlert
              v-else-if="selectedProviderIsOpenRouter"
              color="primary"
              variant="subtle"
              title="OpenRouter provider detected"
              description="Select an OpenRouter model below, fetch its endpoints, then choose a provider-prefixed ID."
            />

            <div v-if="selectedProviderIsOpenRouter" class="space-y-2 rounded-lg border border-purple-100 bg-purple-50/60 p-3">
              <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <USelect
                  v-model="selectedOpenRouterModel"
                  :items="openRouterModels.models.map((m) => ({ label: m.name || m.id, value: m.id }))"
                  placeholder="Select OpenRouter model"
                  :loading="openRouterModels.pending"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="ph:cloud-arrow-down"
                  :loading="selectedOpenRouterModel && openRouterEndpoints[selectedOpenRouterModel]?.pending"
                  :disabled="!selectedOpenRouterModel"
                  @click="selectedOpenRouterModel && loadOpenRouterEndpoints(selectedOpenRouterModel)"
                >
                  Fetch endpoints
                </UButton>
                <span class="text-xs text-slate-500" v-if="selectedOpenRouterModel && openRouterEndpoints[selectedOpenRouterModel]?.fetchedAt">
                  Updated {{ new Date(openRouterEndpoints[selectedOpenRouterModel].fetchedAt || '').toLocaleTimeString() }}
                </span>
              </div>
              <div class="rounded-md border border-purple-100 bg-white/70 p-3 text-xs text-slate-700">
                <div v-if="openRouterModels.pending" class="flex items-center gap-2 text-purple-700">
                  <UIcon name="ph:circle-notch" class="h-4 w-4 animate-spin" /> Fetching models…
                </div>
                <div v-else-if="openRouterModels.error" class="text-red-600">{{ openRouterModels.error }}</div>
                <div v-else-if="selectedOpenRouterModel && openRouterEndpoints[selectedOpenRouterModel]?.pending" class="flex items-center gap-2 text-purple-700">
                  <UIcon name="ph:circle-notch" class="h-4 w-4 animate-spin" /> Fetching endpoints…
                </div>
                <div v-else-if="selectedOpenRouterModel && openRouterEndpoints[selectedOpenRouterModel]?.error" class="text-red-600">
                  {{ openRouterEndpoints[selectedOpenRouterModel].error }}
                </div>
                <div v-else-if="selectedOpenRouterModel && openRouterEndpoints[selectedOpenRouterModel]?.providers?.length" class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="p in openRouterEndpoints[selectedOpenRouterModel].providers"
                    :key="p.id"
                    color="neutral"
                    variant="soft"
                    class="cursor-pointer"
                    @click="modelForm.provider_id = p.id; useSuggestion(p.name)"
                  >
                    {{ p.id }}
                  </UBadge>
                </div>
                <div v-else class="text-slate-500">Select a model and fetch endpoints to see provider IDs.</div>
              </div>
            </div>

            <div class="rounded-lg border border-purple-100 bg-white p-3">
              <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <UCheckbox v-model="modelForm.supports_images" />
                <span>Supports image inputs</span>
              </label>
              <p class="mt-1 text-xs text-slate-500">When a conversation includes images, routing only selects models with this enabled.</p>
            </div>

            <div class="rounded-lg border border-purple-100 bg-purple-50/50 p-3 text-sm text-slate-700" v-if="selectedProvider">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <UIcon name="ph:stack" class="h-4 w-4 text-purple-600" />
                  <span class="font-medium">Provider models</span>
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="ph:arrow-clockwise"
                  :loading="providerModels[selectedProvider]?.pending"
                  @click="fetchProviderModels(selectedProvider)">
                  Refresh
                </UButton>
              </div>

              <div v-if="providerModels[selectedProvider]?.pending" class="flex items-center gap-2 text-purple-600 text-xs">
                <UIcon name="ph:circle-notch" class="h-4 w-4 animate-spin" /> Fetching models…
              </div>
              <div v-else-if="providerModels[selectedProvider]?.error" class="text-xs text-red-600">
                {{ providerModels[selectedProvider]?.error }}
              </div>
              <div v-else-if="providerModels[selectedProvider]?.data?.length" class="flex flex-wrap gap-2">
                <UBadge
                  v-for="m in providerModels[selectedProvider].data"
                  :key="m.id || m.name"
                  color="neutral"
                  variant="soft"
                  class="cursor-pointer"
                  @click="useSuggestion(m.id || m.name)"
                >
                  {{ m.id || m.name }}
                </UBadge>
              </div>
              <div v-else class="text-xs text-slate-500">No models fetched yet.</div>
            </div>

            <div class="rounded-lg border border-purple-100 bg-purple-50/40 p-3 space-y-3">
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

            <div class="rounded-lg border border-purple-100 bg-purple-50/40 p-3 space-y-3">
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
              { id: 'name', accessorKey: 'name', header: 'Name' },
              { id: 'supports_images', accessorKey: 'supports_images', header: 'Images' },
              { id: 'limits', accessorKey: 'limits', header: 'Req limits' },
              { id: 'token_limits', accessorKey: 'token_limits', header: 'Token limits' },
              { id: 'actions', accessorKey: 'actions', header: 'Actions' },
            ]"
            class="overflow-hidden rounded-xl border border-purple-100"
          >
            <template #supports_images-cell="{ row }">
              <UBadge :color="row.original.supports_images ? 'primary' : 'neutral'" variant="subtle">
                {{ row.original.supports_images ? 'Yes' : 'No' }}
              </UBadge>
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
