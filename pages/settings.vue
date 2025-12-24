<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { computed, ref } from "vue";

type AlertState = { color: "neutral" | "primary" | "success" | "warning" | "error"; title: string; description?: string };

const exporting = ref(false);
const importing = ref(false);
const alert = ref<AlertState | null>(null);

const fileInput = ref<HTMLInputElement | null>(null);

const busy = computed(() => exporting.value || importing.value);

const downloadJson = (payload: unknown, filename: string) => {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportDb = async () => {
  if (busy.value) return;
  exporting.value = true;
  alert.value = null;

  try {
    const dump = await $fetch("/api/settings/export");
    if (process.client) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(dump, `llm-rate-limiter-db-${stamp}.json`);
    }
    alert.value = { color: "success", title: "Export ready", description: "Downloaded JSON export of the SQLite database." };
  } catch (err: any) {
    alert.value = {
      color: "error",
      title: "Export failed",
      description: err?.data?.statusMessage || err?.message || "Unexpected error",
    };
  } finally {
    exporting.value = false;
  }
};

const pickImportFile = () => {
  if (busy.value) return;
  fileInput.value?.click();
};

const importDbFromFile = async (file: File) => {
  importing.value = true;
  alert.value = null;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    const confirmed = process.client
      ? window.confirm("Import will overwrite the current database (providers, models, limits, logs). Continue?")
      : true;
    if (!confirmed) return;

    const res = await $fetch<{ ok: boolean; counts?: Record<string, number> }>("/api/settings/import", {
      method: "POST",
      body: payload,
    });

    const summary = res?.counts
      ? Object.entries(res.counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : "Import completed.";

    alert.value = { color: "success", title: "Import completed", description: summary };
  } catch (err: any) {
    alert.value = {
      color: "error",
      title: "Import failed",
      description: err?.data?.statusMessage || err?.message || "Invalid JSON or server error",
    };
  } finally {
    importing.value = false;
  }
};

const onFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  await importDbFromFile(file);
};
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p class="text-sm text-slate-500">Maintenance</p>
        <h1 class="text-2xl font-semibold text-slate-900">Settings</h1>
      </div>
    </div>

    <UAlert
      v-if="alert"
      :color="alert.color"
      variant="soft"
      :title="alert.title"
      :description="alert.description"
    />

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard class="border-primary-100 bg-white">
        <template #header>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-slate-900">Export database</h2>
            <p class="text-sm text-slate-500">Download a JSON snapshot of providers, models, limits, meta routing, and logs.</p>
          </div>
        </template>

        <div class="flex items-center gap-2">
          <UButton color="primary" icon="ph:download-simple" :loading="exporting" @click="exportDb">
            Export JSON
          </UButton>
        </div>
      </UCard>

      <UCard class="border-primary-100 bg-white">
        <template #header>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-slate-900">Import database</h2>
            <p class="text-sm text-slate-500">Upload a previously exported JSON file. This overwrites the current database.</p>
          </div>
        </template>

        <div class="space-y-3">
          <UAlert
            color="warning"
            variant="soft"
            title="Warning"
            description="Import deletes existing rows and replaces them with the uploaded snapshot."
          />

          <input
            ref="fileInput"
            type="file"
            accept="application/json"
            class="hidden"
            @change="onFileChange"
          />

          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="soft" icon="ph:upload-simple" :loading="importing" @click="pickImportFile">
              Import JSON…
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>

