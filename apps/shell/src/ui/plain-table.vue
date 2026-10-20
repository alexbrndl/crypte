<script setup lang="ts">
// Une table sans cadre, dans une page ou un bloc : celle des tables de la
// maquette, un en-tête de 24 px, des lignes de 32 px, 12 px entre les cellules.
</script>

<template>
  <table class="plain-table">
    <slot />
  </table>
</template>

<style scoped>
.plain-table {
  border-collapse: collapse;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

:slotted(th),
:slotted(td) {
  padding: var(--space-1-5) var(--space-3) var(--space-1-5) 0;
  box-shadow: inset 0 calc(-1 * var(--stroke-hairline)) 0 var(--border-light);
  text-align: left;
  vertical-align: top;
}

:slotted(thead th) {
  padding-block: var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

:slotted(tbody th) {
  font-weight: var(--weight-normal);
}

/* Mono text on a 14 px line: aligned on the baseline, it grew each row by 1 px. */
:slotted(td code) {
  vertical-align: top;
}
</style>
