<script setup lang="ts">
// The table of the Figma file: a rounded frame, the head on the subtle
// background, 38 px rows split by a light hairline. Each row can be chosen, its
// link in the first cell, and `data-selected` marks the chosen one. `.grow`
// takes the room left, `.code` is a value, `data-ink="error"` a problem.
</script>

<template>
  <table class="card-table">
    <slot />
  </table>
</template>

<style scoped>
.card-table {
  width: 100%;
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-md);
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  background: var(--background-raised);
}

:slotted(th),
:slotted(td) {
  padding: 9px var(--space-3);
  text-align: left;
  vertical-align: top;
}

:slotted(thead th) {
  padding-block: var(--space-1-5);
  background: var(--background-subtle);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xs);
  white-space: nowrap;
}

:slotted(tbody th),
:slotted(tbody td) {
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-light);
}

:slotted(tbody th) {
  font-size: var(--text-sm);
  font-weight: var(--weight-normal);
  line-height: var(--leading-sm);
  white-space: nowrap;
}

:slotted(tbody td) {
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

:slotted(tbody tr) {
  cursor: pointer;
}

:slotted(tbody tr:hover) {
  background: var(--background-hover);
}

:slotted(tbody tr[data-selected]) {
  background: var(--background-current);
}

:slotted(tbody tr[data-selected]:hover) {
  background: var(--background-current-hover);
}

:slotted(tbody th a) {
  color: var(--text-primary);
  text-decoration: none;
}

:slotted(tbody th a:focus-visible) {
  border-radius: var(--radius-xs);
  outline: var(--stroke-focus) solid var(--accent-focus);
}

:slotted(.grow) {
  width: 100%;
}

:slotted(.code) {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  white-space: nowrap;
}

:slotted([data-ink='error']) {
  color: var(--error-text);
}
</style>
