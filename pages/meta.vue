<script setup lang="ts">
definePageMeta({ layout: "dashboard" });

import { reactive, computed, ref } from "vue";

const { data, refresh, pending } = await useFetch("/api/config");

const metaForm = reactive({
  name: "",
  model_ids: [] as number[],
});

const editing = ref<string | null>(null);
const dragging = ref<number | null>(null);

const modelOptions = computed(() =>
  (data.value?.models ?? []).map((m: any) => ({
    label: `${m.provider_id} / ${m.name} (#${m.id})`,
    value: m.id,
  }))
);

const availableModels = computed(() => data.value?.models ?? []);

const submitMeta = async () => {
  await $fetch("/api/meta", {
    method: "POST",
    body: { name: metaForm.name, model_ids: metaForm.model_ids },
  });
  await refresh();
  editing.value = metaForm.name || null;
};

const editMeta = (metaName: string, modelIds: number[]) => {
  metaForm.name = metaName;
  metaForm.model_ids = [...modelIds];
  editing.value = metaName;
};

const resetForm = () => {
  metaForm.name = "";
  metaForm.model_ids = [];
  editing.value = null;
};

const deleteMeta = async (metaName: string) => {
  if (!metaName) return;
  await $fetch(`/api/meta/${encodeURIComponent(metaName)}`, { method: "DELETE" });
  if (editing.value === metaName) {
    resetForm();
  }
  await refresh();
};

const isSelected = (id: number) => metaForm.model_ids.includes(id);

const toggleModel = (id: number) => {
  if (isSelected(id)) {
    metaForm.model_ids = metaForm.model_ids.filter((x) => x !== id);
  } else {
    metaForm.model_ids = [...metaForm.model_ids, id];
  }
};

const removeModel = (id: number) => {
  metaForm.model_ids = metaForm.model_ids.filter((x) => x !== id);
};

const startDrag = (id: number) => {
  dragging.value = id;
};

const onDrop = (targetId: number) => {
  if (dragging.value === null || dragging.value === targetId) {
    dragging.value = null;
    return;
  }
  const ids = [...metaForm.model_ids];
  const from = ids.indexOf(dragging.value);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) {
    dragging.value = null;
    return;
  }
  ids.splice(from, 1);
  ids.splice(to, 0, dragging.value);
  metaForm.model_ids = ids;
  dragging.value = null;
};

const allowDrop = (event: DragEvent) => {
  event.preventDefault();
};

const endDrag = () => {
  dragging.value = null;
};

const metaGrouped = computed(() => {
  if (!data.value?.meta) return [];
  const groups: Record<string, any[]> = {};
  for (const row of data.value.meta) {
    if (!groups[row.meta]) groups[row.meta] = [];
    groups[row.meta].push(row);
  }
  return Object.entries(groups).map(([meta, rows]) => ({ meta, rows }));
});
</script>

<template>
  <UContainer class="py-10 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-slate-500">Routing</p>
        <h1 class="text-2xl font-semibold text-slate-900">Meta Models</h1>
      </div>
      <UButton color="neutral" variant="ghost" icon="ph:arrows-clockwise" :loading="pending" @click="refresh">Refresh</UButton>
    </div>

    <UCard class="border-primary-100 bg-white">
      <div class="grid gap-6 lg:grid-cols-[420px,1fr]">
        <div class="space-y-3">
          <UForm :state="metaForm" @submit.prevent="submitMeta" class="space-y-3">
            <div class="flex items-end gap-2">
              <UFormField label="Name" name="name" class="flex-1" required>
                <UInput v-model="metaForm.name" placeholder="balanced-mix" />
              </UFormField>
              <UBadge v-if="editing" color="primary" variant="soft" class="mb-1">Editing</UBadge>
            </div>

            <div class="grid gap-3 lg:grid-cols-2">
              <div class="rounded-lg border border-primary-100 bg-primary-50/60 p-3 space-y-2 max-h-96 overflow-auto">
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">Available models</p>
                  <span class="text-[11px] text-slate-500">Check to add</span>
                </div>
                <div v-if="!availableModels.length" class="text-xs text-slate-500">No models available.</div>
                <div v-else class="space-y-2">
                  <label
                    v-for="m in availableModels"
                    :key="m.id"
                    class="flex items-center gap-2 rounded-md border border-transparent hover:border-primary-200 bg-white px-2 py-1.5 cursor-pointer"
                  >
                    <UCheckbox :model-value="isSelected(m.id)" @update:model-value="() => toggleModel(m.id)" />
                    <div class="flex flex-col text-xs text-slate-700">
                      <span class="font-semibold">{{ m.provider_id }} / {{ m.name }}</span>
                      <span class="text-slate-500">#{{ m.id }}</span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="rounded-lg border border-primary-100 bg-white p-3 space-y-2 max-h-96 overflow-auto">
                <div class="flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-700">Selected models (drag to reorder)</p>
                  <span class="text-[11px] text-slate-500">Order = routing priority</span>
                </div>
                <div v-if="!metaForm.model_ids.length" class="text-xs text-slate-500">No models selected.</div>
                <ul v-else class="space-y-2">
                  <li
                    v-for="id in metaForm.model_ids"
                    :key="id"
                    draggable="true"
                    @dragstart="startDrag(id)"
                    @dragover="allowDrop"
                    @drop="onDrop(id)"
                    @dragend="endDrag"
                    class="flex items-center justify-between rounded-md border border-primary-100 bg-primary-50/60 px-3 py-2 text-xs text-slate-800"
                  >
                    <div class="flex items-center gap-2">
                      <UIcon name="ph:arrows-out-cardinal" class="h-4 w-4 text-primary-600" />
                      <div class="flex flex-col">
                        <span class="font-semibold">{{ availableModels.find((m) => m.id === id)?.provider_id }} / {{ availableModels.find((m) => m.id === id)?.name }}</span>
                        <span class="text-slate-500">#{{ id }}</span>
                      </div>
                    </div>
                    <UButton size="xs" color="red" variant="ghost" icon="ph:x" @click="removeModel(id)">
                      Remove
                    </UButton>
                  </li>
                </ul>
              </div>
            </div>

            <p class="text-xs text-slate-500">Order on the right determines priority for routing.</p>
            <div class="flex items-center gap-2">
              <UButton type="submit" color="primary" icon="ph:floppy-disk">
                {{ editing ? 'Update Meta' : 'Save Meta' }}
              </UButton>
              <UButton v-if="editing" color="neutral" variant="ghost" icon="ph:arrow-counter-clockwise" @click="resetForm">Cancel</UButton>
            </div>
          </UForm>
        </div>
        <div class="space-y-3">
          <div
            v-for="group in metaGrouped"
            :key="group.meta"
            class="rounded-xl border border-primary-100 bg-primary-50/60 p-4"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="ph:arrows-merge" class="h-4 w-4 text-primary-600" />
                <span class="font-semibold text-slate-900">{{ group.meta }}</span>
              </div>
              <div class="flex items-center gap-2">
                <UBadge color="primary">{{ group.rows.length }} targets</UBadge>
                <UButton size="xs" color="neutral" variant="ghost" icon="ph:pencil" @click="editMeta(group.meta, group.rows.map(r => r.model_id))">
                  Edit
                </UButton>
                <UButton size="xs" color="red" variant="ghost" icon="ph:trash" @click="deleteMeta(group.meta)">
                  Delete
                </UButton>
              </div>
            </div>
            <ol class="mt-3 space-y-2 text-sm text-slate-700 list-decimal list-inside">
              <li v-for="row in group.rows" :key="row.model_id">
                {{ row.provider_id }} / {{ row.name }} <span class="text-slate-500">(#{{ row.model_id }})</span>
              </li>
            </ol>
          </div>
          <div v-if="!metaGrouped.length" class="text-sm text-slate-500">No meta routes yet.</div>
        </div>
      </div>
    </UCard>
  </UContainer>
</template>
