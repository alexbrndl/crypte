<!-- Les Hugeicons du fichier Figma (jeu gratuit stroke-rounded, MIT), à 16 px et
     au trait de 1,25. Le trait suit la couleur du texte autour. -->
<script setup lang="ts">
import type { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconArray } from '@hugeicons/vue'

defineProps<{ icon: typeof Search01Icon }>()
</script>

<template>
  <HugeiconsIcon
    class="icon"
    :icon="icon as IconArray"
    :size="16"
    :stroke-width="1.25"
    absolute-stroke-width
    aria-hidden="true"
  />
</template>

<style scoped>
.icon {
  flex: none;
}
</style>
