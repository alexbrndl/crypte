<script setup lang="ts">
import type { TokensEntry } from '@crypte/core/protocol'
import { computed } from 'vue'

// La page d'une famille de tokens : chaque token, sa valeur dans chaque thème, et
// la chaîne d'alias qui y mène. Le shell dessine la forme du §4.2 sans rien savoir
// du fichier qu'un plugin a lu.
const props = defineProps<{ family: TokensEntry }>()

// Une colonne par thème, dans l'ordre où la famille les rencontre.
const themes = computed(() => [
  ...new Set(Object.values(props.family.tokens).flatMap((token) => Object.keys(token.themes))),
])
const tokens = computed(() => Object.entries(props.family.tokens))
</script>

<template>
  <section class="tokens-page" :aria-label="family.name">
    <h2>{{ family.name }}</h2>
    <table>
      <thead>
        <tr>
          <th scope="col">Token</th>
          <th v-for="theme of themes" :key="theme" scope="col">{{ theme }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="[name, token] of tokens" :key="name">
          <th scope="row">
            <code>{{ name }}</code>
            <span class="kind">{{ token.type }}</span>
            <p v-if="token.description" class="description">{{ token.description }}</p>
          </th>
          <td v-for="theme of themes" :key="theme">
            <!-- `background-color` et non `background` : une valeur en `url(…)`
                 y est ignorée au lieu d'être chargée. -->
            <template v-if="token.themes[theme]">
              <span
                v-if="token.type === 'color'"
                class="swatch"
                :style="{ backgroundColor: token.themes[theme].value }"
              ></span>
              <code class="value">{{ token.themes[theme].value }}</code>
              <span v-if="token.themes[theme].alias" class="alias">
                via {{ token.themes[theme].alias.join(' → ') }}
              </span>
            </template>
            <!-- Le thème manquant : la source n'en dit rien, et aucune valeur
                 d'un autre thème ne la remplace (§4.2). -->
            <span v-else class="absent">not declared</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.tokens-page {
  min-height: 70vh;
}

h2 {
  margin: 0 0 12px;
}

table {
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  text-align: left;
  vertical-align: baseline;
  padding: 6px 24px 6px 0;
  border-bottom: 1px solid #e5e7eb;
}

tbody th {
  font-weight: 400;
}

.kind,
.alias,
.absent {
  color: #6b7280;
  font-size: 12px;
}

.kind {
  margin-left: 8px;
}

.alias {
  display: block;
}

.description {
  margin: 4px 0 0;
  color: #374151;
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 1px solid #d1d5db;
  border-radius: 2px;
  vertical-align: -1px;
}
</style>
