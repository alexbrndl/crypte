<!-- The button of the Figma file, label shape, md size: 28 px high. Three of its
     four variants: `outline`, which the shell and the plugins draw, `secondary`, the
     shell's copy link, and `ghost`, the reset of a panel's head. `primary` joins
     with its first consumer. A `kbd`
     in the label is drawn as the Figma keycap. -->
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'outline' | 'secondary' | 'ghost' }>(), {
  variant: 'outline',
})
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
  min-height: var(--button-height, 28px);
  padding: var(--button-padding, var(--space-1) var(--space-2));
  border: 0;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  white-space: nowrap;
  cursor: pointer;
}

/* Outside, unlike the inner frame of Figma: inside, the ring falls under 3:1 on
   the inverse background of `secondary`, and matches the stroke of a pressed
   `outline`. */
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

.button[data-variant='ghost'] {
  background: none;
  color: var(--text-primary);
}

.button[data-variant='ghost']:hover:not(:disabled) {
  background: var(--background-hover);
}

.button[data-variant='secondary'] :slotted(kbd) {
  background: var(--background-inverse-hover);
  color: var(--text-inverse);
}
</style>
