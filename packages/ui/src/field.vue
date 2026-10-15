<!-- The field of the Figma file: the label above in Geist Mono, the control below.
     Overridden, the label row carries the marker in strong emphasis. The control
     goes in the default slot, which receives the id the label points to; the
     `action` slot sits at the end of the label row, its buttons at the sm size of
     the Figma field, xs here so the row keeps its height. A `description` shows as a
     tooltip on the label, and reaches the control through the `described-by` slot prop. -->
<script setup lang="ts">
import { useId } from 'vue'
import Tooltip from './tooltip.vue'

defineProps<{ label: string; overridden?: boolean; description?: string }>()

const id = useId()
</script>

<template>
  <div class="field">
    <div class="row">
      <Tooltip v-if="description" :content="description">
        <label :for="id">{{ label }}</label>
      </Tooltip>
      <label v-else :for="id">{{ label }}</label>
      <span v-if="overridden" class="marker">overridden</span>
      <span class="action"><slot name="action" /></span>
    </div>
    <span v-if="description" :id="`${id}-description`" class="description">{{ description }}</span>
    <slot :id="id" :described-by="description ? `${id}-description` : undefined" />
  </div>
</template>

<style scoped>
.field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.row {
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
}

label {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.marker {
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
  color: var(--text-current);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.marker::before {
  content: '';
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-full);
  background: var(--accent-base);
}

/* The sm button of the Figma field, 24 px high: the density goes through the
   button's custom properties, never through a prop. */
.action {
  display: flex;
  margin-left: auto;
  --button-height: 20px;
  --button-padding: var(--space-0-5) var(--space-2);
  /* The row keeps its 16 px with or without a button: an edit that grew it
     pushed every field below by 8 px. */
  margin-block: calc(-1 * var(--space-0-5));
}

/* Read by a screen reader through the control's `aria-describedby`, the tooltip
   on the label being out of the keyboard's reach. */
.description {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
