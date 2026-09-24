<!-- Le cas négatif du contrat de `Callout`, vérifié par `vue-tsc` (script
     `typecheck`). Il vit dans un `.vue` parce que `vp check` ne lit pas ces
     fichiers et type les props par le shim : dans un `.ts`, la directive y
     serait jugée inutile. -->
<script setup lang="ts">
import { Callout } from '../src'
</script>

<template>
  <!-- @vue-expect-error -->
  <Callout tone="info" />
</template>
