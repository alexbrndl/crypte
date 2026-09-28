<script setup lang="ts">
import type { Overrides, StoryEntry } from '@crypte/core/protocol'
import { Callout } from '@crypte/ui'
import { onMounted, shallowRef, type Component } from 'vue'
import PanelFrame from './panel-frame.vue'

// Ce que les plugins apportent au shell, section 6.1 des contrats : chaque module
// est importé tel que le CLI le sert, et son export par défaut est monté dans
// un cadre, dans l'ordre de `plugins`. Le nom d'un plugin est unique : le CLI
// refuse les surfaces d'un second plugin du même nom.

defineProps<{ entry: StoryEntry | null }>()
const emit = defineEmits<{ overrides: [values: Overrides] }>()

const PLUGINS = '/@crypte/plugins.json'

const panels = shallowRef<{ name: string; panel: Component }[]>([])
const failures = shallowRef<{ name: string; message: string }[]>([])

const said = (error: unknown) => (error instanceof Error ? error.message : String(error))

onMounted(async () => {
  let listed: { name: string; shell: string }[]
  try {
    listed = (await fetch(PLUGINS).then((answer) => answer.json())) as typeof listed
  } catch (error) {
    failures.value = [{ name: 'la liste des plugins', message: said(error) }]
    return
  }

  // Chacun pour soi : un module qui ne charge pas ne coûte pas les autres, et son
  // nom s'affiche plutôt que son panneau manque sans rien dire.
  const loaded = await Promise.allSettled(
    listed.map((one) => import(/* @vite-ignore */ one.shell) as Promise<{ default?: unknown }>),
  )

  const found: typeof panels.value = []
  const failed: typeof failures.value = []

  loaded.forEach((result, at) => {
    const name = listed[at]!.name
    const panel = result.status === 'fulfilled' ? result.value.default : undefined

    // Un objet ou une fonction, ce que Vue monte. Autre chose, `42` par exemple,
    // ne rendait rien et ne disait rien. Mesuré.
    if (result.status === 'rejected') failed.push({ name, message: said(result.reason) })
    else if ((typeof panel !== 'object' || panel === null) && typeof panel !== 'function')
      failed.push({ name, message: "le module n'exporte pas de composant par défaut" })
    else found.push({ name, panel: panel as Component })
  })

  panels.value = found
  failures.value = failed
})
</script>

<template>
  <Callout v-if="failures.length > 0" tone="danger" class="failed" role="alert">
    <p v-for="one of failures" :key="one.name">
      <code>{{ one.name }}</code> n'a pas pu se charger : {{ one.message }}
    </p>
  </Callout>
  <PanelFrame
    v-for="one of panels"
    :key="one.name"
    :name="one.name"
    :panel="one.panel"
    :entry="entry"
    @overrides="(values: Overrides) => emit('overrides', values)"
  />
</template>

<style scoped>
.failed {
  --callout-font-size: 13px;
  margin-top: 12px;
}

.failed p {
  margin: 0;
}
</style>
