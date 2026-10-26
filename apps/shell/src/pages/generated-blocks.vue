<script setup lang="ts">
import type { StoryEntry, Theme } from '@crypte/core/protocol'
import { Hexagon01Icon } from '@hugeicons/core-free-icons'
import { computed } from 'vue'
import Icon from '../ui/icon.vue'
import NoneValue from '../ui/none-value.vue'
import PlainTable from '../ui/plain-table.vue'
import { sameTab } from '../navigation/url'
import { valueIn, type Category } from '../tokens/categories'
import LiveExample from './live-example.vue'
import { texts } from '../i18n'

// Les blocs qu'une page Docs reçoit d'office, sans rien écrire dans son markdown :
// l'exemple vivant de la première story, les props du composant et les tokens
// qu'il lit. Tirés du catalogue, ils suivent le code sans relecture.
const props = defineProps<{
  stories: StoryEntry[]
  categories: Category[]
  theme: Theme
  hrefOfStory: (id: string) => string
  hrefOfToken: (name: string) => string | null
}>()
const emit = defineEmits<{ story: [id: string]; token: [name: string] }>()

const t = texts({
  en: {
    props: 'Props',
    generated: 'generated',
    prop: 'Prop',
    type: 'Type',
    default: 'Default',
    description: 'Description',
    required: 'required',
    noProp: 'No prop.',
    tokens: 'Tokens',
  },
  fr: {
    props: 'Props',
    generated: 'généré',
    prop: 'Prop',
    type: 'Type',
    default: 'Défaut',
    description: 'Description',
    required: 'requise',
    noProp: 'Aucune prop.',
    tokens: 'Tokens',
  },
})

const first = computed(() => props.stories[0])
const details = computed(() => Object.entries(first.value?.details ?? {}))

// Une valeur par défaut telle qu'un fichier l'écrirait, coupée au-delà de 32 signes.
const written = (value: unknown) => {
  const text = typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
  return text.length > 32 ? `${text.slice(0, 31)}…` : text
}

// Chaque token lu, avec sa couleur dans le thème affiché quand c'en est une.
const tokens = computed(() => {
  const all = props.categories.flatMap((one) => one.groups.flatMap((group) => group.tokens))
  return (first.value?.component.tokens ?? []).map((name) => {
    const token = all.find((one) => one.name === name)
    const color = token?.value.type === 'color' ? valueIn(token.value, props.theme) : undefined
    return { name, color, href: props.hrefOfToken(name) }
  })
})

function follow(event: MouseEvent, name: string) {
  if (!sameTab(event)) return
  event.preventDefault()
  emit('token', name)
}
</script>

<template>
  <div v-if="first" class="generated-blocks">
    <LiveExample
      :story="first"
      :theme="theme"
      :href="hrefOfStory(first.id)"
      @show="(id) => emit('story', id)"
    />

    <section :aria-label="t('props')">
      <h3>
        {{ t('props') }} <span class="tag">{{ t('generated') }}</span
        ><code class="source">{{ first.component.file }}</code>
      </h3>
      <PlainTable v-if="details.length > 0" class="props">
        <thead>
          <tr>
            <th scope="col">{{ t('prop') }}</th>
            <th scope="col">{{ t('type') }}</th>
            <th scope="col">{{ t('default') }}</th>
            <th scope="col">{{ t('description') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[name, one] of details" :key="name">
            <td>
              <code>{{ name }}</code>
              <span v-if="one.required" class="required">{{ t('required') }}</span>
            </td>
            <td>
              <code class="type">{{ one.type }}</code>
              <code v-if="one.options?.length" class="options">{{
                one.options.map(written).join(' | ')
              }}</code>
            </td>
            <td>
              <code v-if="one.default !== undefined">{{ written(one.default) }}</code>
              <NoneValue v-else />
            </td>
            <td class="description">{{ one.description }}</td>
          </tr>
        </tbody>
      </PlainTable>
      <p v-else class="none">{{ first.propsUnread ?? t('noProp') }}</p>
    </section>

    <section v-if="tokens.length > 0" :aria-label="t('tokens')">
      <h3>
        {{ t('tokens') }} <span class="tag">{{ t('generated') }}</span>
      </h3>
      <ul class="chips">
        <li v-for="one of tokens" :key="one.name">
          <component
            :is="one.href ? 'a' : 'span'"
            class="chip"
            :href="one.href ?? undefined"
            @click="one.href && follow($event, one.name)"
          >
            <span v-if="one.color" class="swatch" :style="{ background: one.color }" />
            <Icon v-else :icon="Hexagon01Icon" />
            <code>{{ one.name }}</code>
          </component>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.generated-blocks {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  margin-bottom: var(--space-5);
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

h3 {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  line-height: var(--leading-base);
}

.tag {
  padding: 0 var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--accent-base);
  color: var(--text-inverse);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
  line-height: var(--leading-xs);
}

.source {
  color: var(--text-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-normal);
}

code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.props {
  width: 100%;
}

.type {
  color: var(--text-current);
}

.options {
  display: block;
  color: var(--text-muted);
}

.description {
  color: var(--text-muted);
}

.required {
  margin-left: var(--space-1-5);
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.none {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-full);
  color: var(--text-primary);
  text-decoration: none;
}

a.chip:hover {
  background: var(--background-hover);
}

.swatch {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: var(--stroke-hairline) solid var(--border-base);
  border-radius: var(--radius-xs);
}
</style>
