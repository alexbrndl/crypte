<!-- The alert of the Figma file: a persistent message, its meaning written in its
     title rather than carried by color alone. Two consumers, the shell's notices
     and the site's. -->
<script setup lang="ts">
defineProps<{
  color: 'info' | 'success' | 'warning' | 'error'
}>()
</script>

<template>
  <div class="alert" :data-color="color">
    <slot />
  </div>
</template>

<!-- Density comes from the context's custom properties, never from a prop: the
     shell and the site set their own, and the component knows neither. -->
<style scoped>
.alert {
  box-sizing: border-box;
  padding: var(--alert-padding, var(--space-3) var(--space-4));
  border-left: var(--stroke-marker) solid var(--alert-solid);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: var(--alert-background);
  color: var(--text-muted);
  font-size: var(--alert-font-size, var(--text-xs));
  line-height: var(--leading-xs);
}

.alert :slotted(h2) {
  margin: 0 0 var(--space-1);
  color: var(--alert-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-sm);
}

.alert[data-color='info'] {
  --alert-solid: var(--info-solid);
  --alert-background: var(--info-background);
  --alert-text: var(--info-text);
}

.alert[data-color='success'] {
  --alert-solid: var(--success-solid);
  --alert-background: var(--success-background);
  --alert-text: var(--success-text);
}

.alert[data-color='warning'] {
  --alert-solid: var(--warning-solid);
  --alert-background: var(--warning-background);
  --alert-text: var(--warning-text);
}

.alert[data-color='error'] {
  --alert-solid: var(--error-solid);
  --alert-background: var(--error-background);
  --alert-text: var(--error-text);
}
</style>
