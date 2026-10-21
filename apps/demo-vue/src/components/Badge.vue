<script setup lang="ts">
withDefaults(defineProps<{ label: string; tone?: 'neutral' | 'warning' }>(), { tone: 'neutral' })
</script>

<template>
  <span class="badge" :data-tone="tone">{{ label }}</span>
</template>

<style scoped>
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: #e7e5e4;
  color: #1c1917;
  font:
    12px/16px system-ui,
    sans-serif;
}

.badge[data-tone='warning'] {
  background: #fde68a;
}
</style>
