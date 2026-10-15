<!-- Le cas négatif du contrat de `Button`, vérifié par `vue-tsc` comme celui
     d'`Alert`. `primary` est un variant du fichier Figma qu'aucun consommateur ne
     dessine encore. -->
<script setup lang="ts">
import { Button } from '../src'
</script>

<template>
  <!-- @vue-expect-error -->
  <Button variant="primary" />
</template>
