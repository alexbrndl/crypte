<script setup lang="ts">
import { provide } from 'vue'

// Le `wrap` du fichier de stories de Counter, section 2.5 : il enveloppe ses stories et
// fournit ce que les composants lisent par `inject`.
provide('frame', 'panel')
</script>

<template>
  <div data-frame="panel"><slot /></div>
</template>
