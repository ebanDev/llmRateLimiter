<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { reactive } from "vue";

const { data, refresh, pending } = await useFetch("/api/config");

const searchProviderForm = reactive({
  id: "",
  display_name: "",
  base_url: "",
  api_key: "",
  priority: 0,
  per_minute: "",
  per_hour: "",
  per_day: "",
  per_month: "",
  active: 1,
});

const submitSearchProvider = async () => {
  await $fetch("/api/search-providers", { method: "POST", body: searchProviderForm });
  await refresh();
};
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-slate-500">Search stack</p>
        <h1 class="text-2xl font-semibold text-slate-900">Search Providers</h1>
      </div>
      <UButton color="neutral" variant="ghost" icon="ph:arrows-clockwise" :loading="pending" @click="refresh">Refresh</UButton>
    </div>

    <UCard class="border-primary-100 bg-white">
      <div class="grid gap-6 lg:grid-cols-[420px,1fr]">
        <div class="space-y-3">
          <UForm :state="searchProviderForm" @submit.prevent="submitSearchProvider" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="ID" name="id" required>
                <UInput v-model="searchProviderForm.id" />
              </UFormField>
              <UFormField label="Display Name" name="display_name">
                <UInput v-model="searchProviderForm.display_name" />
              </UFormField>
            </div>
            <UFormField label="Base URL" name="base_url" required>
              <UInput v-model="searchProviderForm.base_url" placeholder="https://api.perplexity.ai" />
            </UFormField>
            <UFormField label="API Key" name="api_key">
              <UInput v-model="searchProviderForm.api_key" type="password" />
            </UFormField>
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Priority" name="priority">
                <UInput v-model.number="searchProviderForm.priority" type="number" />
              </UFormField>
              <UFormField label="Active" name="active">
                <UInput v-model.number="searchProviderForm.active" type="number" min="0" max="1" />
              </UFormField>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="per_minute" name="per_minute">
                <UInput v-model="searchProviderForm.per_minute" type="number" />
              </UFormField>
              <UFormField label="per_hour" name="per_hour">
                <UInput v-model="searchProviderForm.per_hour" type="number" />
              </UFormField>
              <UFormField label="per_day" name="per_day">
                <UInput v-model="searchProviderForm.per_day" type="number" />
              </UFormField>
              <UFormField label="per_month" name="per_month">
                <UInput v-model="searchProviderForm.per_month" type="number" />
              </UFormField>
            </div>
            <UButton type="submit" color="primary" icon="ph:floppy-disk">Save Search Provider</UButton>
          </UForm>
        </div>
        <div>
          <UTable
            :rows="data?.searchProviders ?? []"
            :columns="[
              { id: 'id', accessorKey: 'id', header: 'ID' },
              { id: 'display_name', accessorKey: 'display_name', header: 'Display' },
              { id: 'base_url', accessorKey: 'base_url', header: 'Base URL' },
              { id: 'priority', accessorKey: 'priority', header: 'Prio' },
              { id: 'limits', accessorKey: 'limits', header: 'Limits' },
              { id: 'active', accessorKey: 'active', header: 'Active' },
            ]"
            class="overflow-hidden rounded-xl border border-primary-100"
          >
            <template #limits-data="{ row }">
              <span class="font-mono text-xs">
                {{ row.per_minute ?? '-' }} / {{ row.per_hour ?? '-' }} / {{ row.per_day ?? '-' }} / {{ row.per_month ?? '-' }}
              </span>
            </template>
          </UTable>
        </div>
      </div>
    </UCard>
  </UContainer>
</template>
