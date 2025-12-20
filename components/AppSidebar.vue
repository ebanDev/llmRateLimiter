<script setup lang="ts">
import { computed } from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";

const route = useRoute();

const items = computed<NavigationMenuItem[][]>(() => [
  [
    { label: "Overview", icon: "ph:house", to: "/", active: route.path === "/" },
    { label: "Usage", icon: "ph:chart-line", to: "/usage", active: route.path === "/usage" },
    {
      label: "LLMs", icon: "ph:robot", defaultOpen: true, children: [
        { label: "Providers", icon: "ph:plugs-connected", to: "/providers", active: route.path === "/providers" },
        { label: "Models", icon: "ph:brain", to: "/models", active: route.path === "/models" },
        { label: "Meta Routing", icon: "ph:arrows-merge", to: "/meta", active: route.path === "/meta" },
      ]
    },
    { label: "Settings", icon: "ph:gear-six", to: "/settings", active: route.path === "/settings" },
    [
    ],
    {
      label: "GitHub",
      icon: "ph:github-logo",
      to: "https://github.com/ebanDev/metallm",
      target: "_blank",
    },
  ],
  [],
]);
</script>

<template>
  <UDashboardSidebar collapsible resizable :ui="{ footer: 'border-t border-default' }">
    <template #header="{ collapsed }">
      <div class="flex items-center gap-3">
        <div
          class="h-9 w-9 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 grid place-items-center text-white font-semibold">
          ML
        </div>
        <div v-if="!collapsed" class="leading-tight">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">Console</p>
          <p class="text-base font-semibold text-slate-900">MetaLLM</p>
        </div>
      </div>
    </template>

    <template #default="{ collapsed }">
      <UNavigationMenu :collapsed="collapsed" :items="items[0]" orientation="vertical" />

      <UNavigationMenu :collapsed="collapsed" :items="items[1]" orientation="vertical" class="mt-auto" />
    </template>

    <template #footer="{ collapsed }">
      <UButton :avatar="{
        icon: 'ph:user-circle',
      }" :label="collapsed ? undefined : 'Admin'" color="neutral" variant="ghost" class="w-full"
        :block="collapsed" />
    </template>
  </UDashboardSidebar>
</template>
