import { CardTable, EmptyNote, SectionHeader, SidebarLink } from '@crypte/ui'
import { computed, defineComponent } from 'vue'

// Les trois parties de la vue i18n, servies telles quelles comme tout module
// shell, et dessinées avec les briques de vue de `@crypte/ui` : la vue ressemble
// à celles du shell sans une ligne de style. L'élément choisi est une langue,
// que l'adresse garde.
const LOCALES = { fr: 'Français', en: 'English', de: 'Deutsch' }
const KEYS = {
  'cart.title': { fr: 'Panier', en: 'Cart', de: 'Warenkorb' },
  'cart.empty': { fr: 'Votre panier est vide', en: 'Your cart is empty' },
  'checkout.pay': { fr: 'Payer', en: 'Pay', de: 'Bezahlen' },
  'checkout.total': { en: 'Total', de: 'Gesamt' },
}
const missingIn = (locale) => Object.keys(KEYS).filter((key) => !KEYS[key][locale])

const sidebar = defineComponent({
  name: 'I18nSidebar',
  components: { SidebarLink },
  props: { item: { type: String, default: null } },
  emits: ['item'],
  setup: () => ({ LOCALES, missingIn }),
  template: `
    <ul aria-label="Languages" style="margin: 0; padding: var(--space-2) 0; list-style: none">
      <li v-for="(name, code) of LOCALES" :key="code">
        <SidebarLink
          :href="'?view=i18n&item=' + code"
          :current="code === item"
          :count="missingIn(code).length"
          @click="(event) => (event.preventDefault(), $emit('item', code))"
        >{{ name }}</SidebarLink>
      </li>
    </ul>
  `,
})

const canvas = defineComponent({
  name: 'I18nCanvas',
  components: { CardTable, SectionHeader },
  props: { item: { type: String, default: null } },
  emits: ['item'],
  setup: () => ({ LOCALES, KEYS }),
  template: `
    <SectionHeader title="keys" :count="Object.keys(KEYS).length" note="every language" />
    <CardTable>
      <thead>
        <tr>
          <th scope="col">key</th>
          <th v-for="(name, code) of LOCALES" :key="code" scope="col">{{ code }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(values, key) of KEYS" :key="key">
          <th scope="row"><code>{{ key }}</code></th>
          <td
            v-for="(name, code) of LOCALES"
            :key="code"
            :data-ink="values[code] ? undefined : 'error'"
          >{{ values[code] ?? 'missing' }}</td>
        </tr>
      </tbody>
    </CardTable>
  `,
})

const panel = defineComponent({
  name: 'I18nPanel',
  components: { EmptyNote },
  props: { item: { type: String, default: null } },
  emits: ['item'],
  setup(props) {
    return { LOCALES, missing: computed(() => (props.item ? missingIn(props.item) : [])) }
  },
  template: `
    <EmptyNote v-if="!item">Choose a language to see what it lacks.</EmptyNote>
    <template v-else>
      <p style="margin: 0 0 var(--space-2)">{{ LOCALES[item] }}: {{ missing.length }} missing</p>
      <code v-for="key of missing" :key="key" style="display: block; font-size: var(--text-xs)">{{ key }}</code>
    </template>
  `,
})

// Une vue sans panneau des stories : pas d'export par défaut.
export const view = { sidebar, canvas, panel }
