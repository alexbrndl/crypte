<!-- One consumer today, the shell's render failure and set-aside notice:
     promoted ahead of the site, which is starting now and draws the same
     notices. Reopened if the site ships without using it. -->
<script setup lang="ts">
defineProps<{
  tone: 'warning' | 'danger'
}>()
</script>

<template>
  <div class="callout" :data-tone="tone">
    <slot />
  </div>
</template>

<!-- Density comes from the context's custom properties, never from a prop: the
     shell and the site set their own, and the component knows neither. -->
<style scoped>
.callout {
  padding: var(--callout-padding, 8px 12px);
  font-size: var(--callout-font-size, inherit);
  box-sizing: border-box;
}

.callout[data-tone='warning'] {
  border: 1px solid #fcd34d;
  background: #fffbeb;
}

.callout[data-tone='danger'] {
  border: 1px solid #fca5a5;
  background: #fef2f2;
}
</style>
