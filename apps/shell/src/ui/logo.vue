<!-- La marque de brand/icon.svg, halos compris, en tête de l'activity bar. Le même
     fichier que le favicon : le build l'émet une fois pour les deux. -->
<script setup lang="ts">
import icon from '../../../../brand/icon.svg'
</script>

<template>
  <img :src="icon" width="18" height="18" alt="Crypte" />
</template>
