<script setup lang="ts">
// La pastille d'une couleur, 12 px, à côté de sa valeur.
defineProps<{ color: string }>()
</script>

<template>
  <!-- `background-color` et non `background` : une valeur en `url(…)` y est
       ignorée au lieu d'être chargée. -->
  <span class="color-swatch" :style="{ backgroundColor: color }" />
</template>

<style scoped>
.color-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  flex: none;
  border-radius: var(--radius-xs);
  box-shadow: inset 0 0 0 var(--stroke-hairline) var(--border-base);
  vertical-align: middle;
}
</style>
