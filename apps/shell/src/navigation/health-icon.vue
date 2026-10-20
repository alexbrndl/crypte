<!-- Le cœur de Santé, celui de Hugeicons (`FavouriteIcon`), qui se remplit depuis
     le bas en proportion du score : l'état du design system d'un coup d'œil, sans
     texte, illisible à 16 px. Dessiné ici et non par `Icon`, qui ne sait pas
     découper un tracé. Au trait des autres icônes : 1,25 à 16 px, soit 1,875 dans
     la grille de 24. -->
<script setup lang="ts">
import { computed, useId } from 'vue'

// Le score, de 0 à 100 ; `null` tant qu'il ne se mesure pas, le cœur reste vide.
const props = defineProps<{ score: number | null }>()

const HEART =
  'M10.4107 19.9677C7.58942 17.858 2 13.0348 2 8.69444C2 5.82563 4.10526 3.5 7 3.5C8.5 3.5 10 4 12 6C14 4 15.5 3.5 17 3.5C19.8947 3.5 22 5.82563 22 8.69444C22 13.0348 16.4106 17.858 13.5893 19.9677C12.6399 20.6776 11.3601 20.6776 10.4107 19.9677Z'
// Le cœur va de 3,5 à 20,5 dans la grille : le remplissage monte d'autant.
const TOP = 3.5
const BOTTOM = 20.5

const clip = useId()
const level = computed(() => {
  const share = Math.min(Math.max(props.score ?? 0, 0), 100) / 100
  return BOTTOM - (BOTTOM - TOP) * share
})
</script>

<template>
  <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <clipPath :id="clip">
      <rect x="0" :y="level" width="24" :height="24 - level" />
    </clipPath>
    <path v-if="score" :d="HEART" fill="currentColor" :clip-path="`url(#${clip})`" />
    <path
      :d="HEART"
      stroke="currentColor"
      stroke-width="1.875"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
