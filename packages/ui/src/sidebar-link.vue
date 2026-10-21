<script setup lang="ts">
// A sidebar row, `row` of the Figma file: 24 px, padding 2/12, gap 6, the label
// cut, the count at the right. The current row has the band and the marker at
// the column's edge, as the tree's first level.
defineProps<{ href: string; current: boolean; count?: number | string }>()
const emit = defineEmits<{ click: [event: MouseEvent] }>()
defineSlots<{ default(): unknown; icon?(): unknown; detail?(): unknown }>()
</script>

<template>
  <a
    class="sidebar-link"
    :href="href"
    :aria-current="current ? 'page' : undefined"
    @click="emit('click', $event)"
  >
    <slot name="icon" />
    <span class="label"><slot /></span>
    <span v-if="count !== undefined" class="count">{{ count }}</span>
    <slot name="detail" />
  </a>
</template>

<style scoped>
.sidebar-link {
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
  padding: var(--space-0-5) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-decoration: none;
}

.sidebar-link:hover {
  background: var(--background-hover);
  color: var(--text-primary);
}

.sidebar-link:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

.sidebar-link[aria-current='page'] {
  box-shadow: inset var(--stroke-marker) 0 0 var(--accent-base);
  background: var(--background-current);
  color: var(--text-current);
  font-weight: var(--weight-medium);
}

.sidebar-link[aria-current='page']:hover {
  box-shadow: inset var(--stroke-marker) 0 0 var(--accent-hover);
  background: var(--background-current-hover);
  color: var(--text-current-hover);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.sidebar-link[aria-current='page'] .count {
  color: var(--text-current);
}
</style>
