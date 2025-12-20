<script setup lang="ts">
import { ref } from "vue";

const token = ref("");
const status = ref<"idle" | "ok" | "error">("idle");
const message = ref("");

const submit = async () => {
  try {
    await $fetch("/api/login", { method: "POST", body: { token: token.value } });
    status.value = "ok";
    message.value = "Authenticated. Redirecting…";
    setTimeout(() => navigateTo("/"), 500);
  } catch (err: any) {
    status.value = "error";
    message.value = err?.data?.statusMessage || "Invalid token";
  }
};
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-white via-purple-50 to-purple-100/40 text-slate-900 flex items-center justify-center">
    <div class="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-2xl">
      <div class="absolute inset-0 bg-gradient-to-br from-purple-100/80 via-white/40 to-pink-100/60 pointer-events-none" />
      <div class="grid md:grid-cols-[1.1fr,0.9fr] relative">
        <div class="p-10 md:p-12 space-y-6">
          <div class="flex items-center gap-3">
            <div class="h-11 w-11 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 grid place-items-center text-white font-bold text-xl">
              ML
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-500">Admin Access</p>
              <h1 class="text-2xl font-semibold">MetaLLM Console</h1>
            </div>
          </div>
          <div class="space-y-3 text-sm text-slate-600">
            <p>Enter your admin token to manage providers, models, limits, and routing.</p>
            <div class="flex items-center gap-2 text-xs text-slate-500">
              <UIcon name="ph:shield-check" class="h-4 w-4 text-purple-600" />
              Single-factor token authentication. Keep it safe.
            </div>
          </div>
          <UForm @submit.prevent="submit" class="space-y-4">
            <UFormField label="Admin Token" name="token">
              <UInput v-model="token" type="password" placeholder="Enter admin token" icon="ph:keyhole" />
            </UFormField>
            <UButton type="submit" color="primary" block icon="ph:arrow-right">Sign in</UButton>
          </UForm>
          <UAlert
            v-if="status !== 'idle'"
            :color="status === 'ok' ? 'green' : 'red'"
            variant="solid"
            :title="status === 'ok' ? 'Success' : 'Error'"
            :description="message"
          />
        </div>
        <div class="hidden md:block relative bg-gradient-to-br from-purple-200 to-white border-l border-purple-100">
          <div class="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.35),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(236,72,153,0.25),transparent_30%)]" />
          <div class="relative h-full p-10 flex flex-col justify-between text-slate-800">
            <div class="space-y-4">
              <p class="text-xs uppercase tracking-[0.3em] text-slate-500">Reliability</p>
              <h2 class="text-2xl font-semibold leading-tight">Unified control for providers, search and meta models.</h2>
              <p class="text-sm text-slate-600">Keep usage compliant, steer traffic to healthy models, and observe pressure at a glance.</p>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="rounded-xl border border-purple-100 bg-white/60 p-3">
                <div class="text-xs text-slate-600">Controls</div>
                <div class="text-lg font-semibold text-slate-900">Providers & Models</div>
              </div>
              <div class="rounded-xl border border-purple-100 bg-white/60 p-3">
                <div class="text-xs text-slate-600">Observability</div>
                <div class="text-lg font-semibold text-slate-900">Live Usage</div>
              </div>
              <div class="rounded-xl border border-purple-100 bg-white/60 p-3 col-span-2">
                <div class="flex items-center gap-2 text-xs text-slate-600">
                  <UIcon name="ph:lock-key" class="h-4 w-4 text-purple-600" /> Token-only auth
                </div>
                <div class="text-sm text-slate-700 mt-1">No external identity required. Rotate keys in .env.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
