<script setup lang="ts">
import { inject, ref } from 'vue'

const props = withDefaults(defineProps<{ start?: number; step?: number }>(), { start: 0, step: 1 })
const count = ref(props.start)
// Fourni par le `wrap` de son fichier de stories : sans lui, le cadre manque.
const frame = inject('frame', 'no frame')
</script>

<template>
  <button type="button" class="counter" :data-frame="frame" @click="count += step">
    {{ count }}
  </button>
</template>

<style scoped>
.counter {
  min-width: 48px;
  padding: 4px 12px;
  font:
    14px/20px system-ui,
    sans-serif;
}
</style>
