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
  margin: 0 0 var(--space-2);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-3xl);
  letter-spacing: var(--tracking-tight);
}

table {
  border-collapse: collapse;
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
}

thead th {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

th,
td {
  text-align: left;
  vertical-align: baseline;
  padding: var(--space-1-5) var(--space-6) var(--space-1-5) 0;
  border-bottom: var(--stroke-hairline) solid var(--border-light);
}

a {
  color: var(--text-current);
  text-decoration: none;
}

a:hover {
  color: var(--text-current-hover);
}

code {
  font-size: var(--text-xs);
}

tbody th {
  font-weight: var(--weight-normal);
}

.kind,
.alias,
.absent {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.kind {
  margin-left: var(--space-2);
}

.alias {
  display: block;
}

.description {
  margin: var(--space-1) 0 0;
  color: var(--text-muted);
}

.swatch {
  display: inline-block;
  width: var(--space-3);
  height: var(--space-3);
  margin-right: var(--space-1-5);
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-xs);
  vertical-align: -1px;
}
</style>
