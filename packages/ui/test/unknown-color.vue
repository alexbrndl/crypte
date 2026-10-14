<!-- Le cas négatif du contrat de `Alert`, vérifié par `vue-tsc` (script
     `typecheck`). Il vit dans un `.vue` parce que `vp check` ne lit pas ces
     fichiers et type les props par le shim : dans un `.ts`, la directive y
     serait jugée inutile. `danger` est l'ancien nom d'`error`. -->
<script setup lang="ts">
import { Alert } from '../src'
</script>

<template>
  <!-- @vue-expect-error -->
  <Alert color="danger" />
</template>
