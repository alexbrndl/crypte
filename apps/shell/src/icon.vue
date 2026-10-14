<!-- Les Hugeicons du fichier Figma (jeu gratuit stroke-rounded, MIT), à 16 px et
     au trait de 1,25. Le trait suit la couleur du texte autour. -->
<script setup lang="ts">
defineProps<{ name: 'arrow-right-01' | 'arrow-down-01' | 'search-01' }>()
</script>

<template>
  <svg
    class="icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.25"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-if="name === 'arrow-right-01'" d="M6 4C6 4 10 6.946 10 8C10 9.054 6 12 6 12" />
    <path v-else-if="name === 'arrow-down-01'" d="M12 6C12 6 9.054 10 8 10C6.946 10 4 6 4 6" />
    <template v-else>
      <path d="M11.3333 11.3333L14 14" />
      <path
        d="M7.33333 2C10.2787 2 12.6667 4.388 12.6667 7.33333C12.6667 10.2787 10.2787 12.6667 7.33333 12.6667C4.388 12.6667 2 10.2787 2 7.33333C2 4.388 4.388 2 7.33333 2Z"
      />
    </template>
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
}
</style>
