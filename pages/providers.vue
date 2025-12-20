<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { useFetch } from "nuxt/app";
import { computed, reactive, ref, watch } from "vue";

const { data, refresh, pending } = await useFetch("/api/config");

const providers = computed(() => data.value?.providers ?? []);

const providerForm = reactive({
  id: "",
  display_name: "",
  base_url: "",
  api_key: "",
});

const OPENROUTER_PREFIX = "openrouter-";

const showForm = ref(false);
const saving = ref(false);

const modelResults = reactive<Record<string, { pending: boolean; error: string | null; data: any[]; tried?: boolean }>>({});
const deleting = reactive<Record<string, boolean>>({});

const resetForm = () => {
  providerForm.id = "";
  providerForm.display_name = "";
  providerForm.base_url = "";
  providerForm.api_key = "";
};

const submitProvider = async () => {
  saving.value = true;
  try {
    await $fetch("/api/providers", { method: "POST", body: providerForm });
    await refresh();
    resetForm();
    showForm.value = false;
  } finally {
    saving.value = false;
  }
};

const deleteProvider = async (id: string) => {
  if (!id || deleting[id]) return;
  deleting[id] = true;
  try {
    await $fetch(`/api/providers/${id}`, { method: "DELETE" });
    await refresh();
  } finally {
    deleting[id] = false;
  }
};

const providerIcon = (id: string) => {
  const trimmed = id.startsWith(OPENROUTER_PREFIX) ? id.slice(OPENROUTER_PREFIX.length) : id;
  const map: Record<string, string> = {
    openrouter: "ph:plugs-connected",
    openai: "ph:sparkle",
    anthropic: "ph:waves",
    groq: "ph:lightning",
    together: "ph:handshake",
    cerebras: "ph:brain",
    google: "ph:google-logo",
    aistudio: "ph:google-logo",
  };
  return map[trimmed] || map[id] || "ph:plugs-connected";
};

const providerLabel = (provider: any) => provider.display_name || provider.id;

const fetchProviderModels = async (provider: any, opts?: { skipIfFetched?: boolean }) => {
  const key = provider.id;
  if (!key || !provider.base_url) return;

  if (!modelResults[key]) {
    modelResults[key] = { pending: false, error: null, data: [], tried: false };
  }

  if (opts?.skipIfFetched && modelResults[key].tried) return;
  if (modelResults[key].pending) return;

  modelResults[key].pending = true;
  modelResults[key].error = null;
  modelResults[key].tried = true;

  try {
    if (provider.id?.startsWith(OPENROUTER_PREFIX)) {
      modelResults[key].error = "OpenRouter providers are managed from the Models page.";
      modelResults[key].data = [];
      return;
    }

    const url = `${provider.base_url.replace(/\/+$/, "")}/models`;
    const res = await $fetch<any>(url, {
      headers: provider.api_key ? { Authorization: `Bearer ${provider.api_key}` } : undefined,
    });
    const list = Array.isArray(res?.data) ? res.data : res?.models ?? [];
    modelResults[key].data = list;
  } catch (err: any) {
    modelResults[key].error = err?.data?.statusMessage || err?.data?.message || err?.message || "Failed to fetch models";
  } finally {
    modelResults[key].pending = false;
  }
};

watch(
  providers,
  (list) => {
    list?.forEach((p) => fetchProviderModels(p, { skipIfFetched: true }));
  },
  { immediate: true }
);
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-sm text-slate-500">Connections</p>
        <h1 class="text-2xl font-semibold text-slate-900">Providers</h1>
      </div>
      <div class="flex gap-2">
        <UButton color="neutral" variant="ghost" icon="ph:arrows-clockwise" :loading="pending" @click="refresh">Refresh</UButton>

        <UModal v-model:open="showForm" title="Add provider" description="Connect a provider with its base URL and key" :ui="{ footer: 'justify-end' }">
          <UButton color="primary" icon="ph:plus">Add provider</UButton>

          <template #body>
            <UForm :state="providerForm" class="space-y-3">
              <UFormField label="ID" name="id" required>
                <UInput v-model="providerForm.id" placeholder="openai" />
              </UFormField>
              <UFormField label="Display Name" name="display_name">
                <UInput v-model="providerForm.display_name" placeholder="OpenAI" />
              </UFormField>
              <UFormField label="Base URL" name="base_url" required>
                <UInput v-model="providerForm.base_url" placeholder="https://api.openai.com/v1" />
              </UFormField>
              <UFormField label="API Key" name="api_key">
                <UInput v-model="providerForm.api_key" type="password" placeholder="sk-..." />
              </UFormField>
            </UForm>
          </template>

          <template #footer>
            <div class="flex gap-2">
              <UButton color="neutral" variant="ghost" @click="showForm = false">Cancel</UButton>
              <UButton color="primary" icon="ph:floppy-disk" :loading="saving" @click="submitProvider">Save provider</UButton>
            </div>
          </template>
        </UModal>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <UCard
        v-for="provider in providers"
        :key="provider.id"
        class="border-purple-100 bg-white flex flex-col"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="h-11 w-11 rounded-xl bg-purple-50 text-purple-600 grid place-items-center">
              <UIcon :name="providerIcon(provider.id)" class="h-5 w-5" />
            </div>
            <div class="space-y-0.5">
              <p class="text-base font-semibold text-slate-900">{{ providerLabel(provider) }}</p>
              <p class="text-xs text-slate-500">{{ provider.id }}</p>
              <UBadge size="xs" :color="(provider.kind || 'openai') === 'openrouter' ? 'primary' : 'neutral'" variant="soft">
                {{ (provider.kind || 'openai') === 'openrouter' ? 'OpenRouter Provider' : 'OpenAI-compat Provider' }}
              </UBadge>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="red"
              variant="ghost"
              icon="ph:trash"
              @click="deleteProvider(provider.id)"
            >
              Delete
            </UButton>
          </div>
        </div>

        <div class="mt-3 space-y-2 text-sm text-slate-600">
          <div class="flex items-center gap-2">
            <UIcon name="ph:link" class="h-4 w-4 text-purple-500" />
            <span class="truncate" :title="provider.base_url">{{ provider.base_url }}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-500">
            <UIcon name="ph:key" class="h-4 w-4 text-purple-500" />
            <span>{{ provider.api_key ? 'API key stored' : 'No API key' }}</span>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between text-sm text-slate-700">
          <div class="flex items-center gap-2">
            <UIcon name="ph:stack" class="h-4 w-4 text-purple-500" />
            <span class="font-medium">Models</span>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="modelResults[provider.id]?.data?.length" color="primary" variant="soft">
              {{ modelResults[provider.id].data.length }} fetched
            </UBadge>
            <span v-else class="text-xs text-slate-500">Not fetched</span>
          </div>
        </div>

        <div class="mt-2 min-h-[48px] rounded-lg border border-dashed border-purple-100 bg-purple-50/40 p-3 text-xs text-slate-700">
          <div v-if="modelResults[provider.id]?.pending" class="flex items-center gap-2 text-purple-600">
            <UIcon name="ph:circle-notch" class="h-4 w-4 animate-spin" />
            Fetching models…
          </div>
          <div v-else-if="modelResults[provider.id]?.error" class="text-red-600">
            {{ modelResults[provider.id].error }}
          </div>
          <div v-else-if="modelResults[provider.id]?.data?.length">
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="model in modelResults[provider.id].data.slice(0, 6)"
                :key="model.id || model.name"
                color="neutral"
                variant="soft"
              >
                {{ model.id || model.name }}
              </UBadge>
              <span v-if="modelResults[provider.id].data.length > 6" class="text-slate-500">
                +{{ modelResults[provider.id].data.length - 6 }} more
              </span>
            </div>
          </div>
          <div v-else class="text-slate-500">Click “Fetch models” to pull from /v1/models.</div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="ph:arrow-clockwise"
            :loading="modelResults[provider.id]?.pending"
            @click="fetchProviderModels(provider)"
          >
            Fetch models
          </UButton>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="ph:copy"
            :to="`/models?provider=${provider.id}`"
          >
            Manage models
          </UButton>
        </div>
      </UCard>
    </div>

    <div v-if="!providers.length && !pending" class="text-center text-slate-500 border border-dashed border-purple-100 rounded-xl p-8">
      No providers yet. Click “Add provider” to create one.
    </div>
  </UContainer>
</template>
