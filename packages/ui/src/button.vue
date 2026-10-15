<!-- The button of the Figma file, label shape, md size: 28 px high. Two of its four
     variants: `outline`, which the shell and the plugins draw, and `secondary`, the
     shell's copy link. `primary` and `ghost` join with their first consumer. A `kbd`
     in the label is drawn as the Figma keycap. -->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'outline' | 'secondary' }>(), { variant: 'outline' })
</script>

<template>
  <button type="button" class="button" :data-variant="variant">
    <slot />
  </button>
</template>

<style scoped>
.button {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  box-sizing: border-box;
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  white-space: nowrap;
  cursor: pointer;
}

.button:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: var(--stroke-hairline);
}

.button:disabled {
  color: var(--text-subtle);
  cursor: default;
}

.button[data-variant='outline'] {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-raised);
  color: var(--text-primary);
}

.button[data-variant='outline']:hover:not(:disabled) {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-strong);
  background: var(--background-hover);
}

.button[data-variant='outline'][aria-pressed='true'] {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--accent-base);
  background: var(--background-current);
  color: var(--text-current);
}

.button[data-variant='secondary'] {
  background: var(--background-inverse);
  color: var(--text-inverse);
}

.button[data-variant='secondary']:hover:not(:disabled) {
  background: var(--background-inverse-hover);
}

.button :slotted(kbd) {
  padding: var(--space-0-5) var(--space-1);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.button[data-variant='outline'] :slotted(kbd) {
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  background: var(--background-raised);
  color: var(--text-muted);
}

.button[data-variant='secondary'] :slotted(kbd) {
  background: var(--background-inverse-hover);
  color: var(--text-inverse);
}
</style>
