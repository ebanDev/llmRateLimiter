<template>
  <UApp>
    <div class="min-h-screen flex bg-transparent">
      <AppSidebar />
      <main class="flex-1 bg-transparent">
        <slot />
      </main>
    </div>
  </UApp>
</template>
