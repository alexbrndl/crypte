import { computed, defineComponent } from 'vue'

// Les trois parties de la vue i18n, servies telles quelles comme tout module
// shell : un `template`, et les tokens du shell en style en ligne. L'élément
// choisi est une langue, que l'adresse garde.
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
  props: { item: { type: String, default: null } },
  emits: ['item'],
  setup: () => ({ LOCALES, missingIn }),
  template: `
    <ul aria-label="Languages" style="margin: 0; padding: var(--space-2) 0; list-style: none">
      <li v-for="(name, code) of LOCALES" :key="code">
        <button
          type="button"
          :aria-current="code === item ? 'page' : undefined"
          :style="{
            display: 'flex', width: '100%', gap: 'var(--space-1-5)', padding: 'var(--space-0-5) var(--space-3)',
            border: 0, font: 'inherit', fontSize: 'var(--text-sm)', textAlign: 'left', cursor: 'pointer',
            background: code === item ? 'var(--background-current)' : 'none',
            color: code === item ? 'var(--text-current)' : 'var(--text-muted)',
          }"
          @click="$emit('item', code)"
        >
          <span style="flex: 1">{{ name }}</span>
          <span style="color: var(--text-subtle)">{{ missingIn(code).length }} missing</span>
        </button>
      </li>
    </ul>
  `,
})

const canvas = defineComponent({
  name: 'I18nCanvas',
  props: { item: { type: String, default: null } },
  emits: ['item'],
  setup: () => ({ LOCALES, KEYS }),
  template: `
    <table style="border-collapse: collapse; font-size: var(--text-sm)">
      <thead>
        <tr>
          <th scope="col" style="padding: var(--space-1-5) var(--space-3) var(--space-1-5) 0; text-align: left; color: var(--text-muted)">key</th>
          <th
            v-for="(name, code) of LOCALES"
            :key="code"
            scope="col"
            :style="{ padding: 'var(--space-1-5) var(--space-3) var(--space-1-5) 0', textAlign: 'left', color: code === item ? 'var(--text-current)' : 'var(--text-muted)' }"
          >{{ code }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(values, key) of KEYS" :key="key">
          <th scope="row" style="padding: var(--space-1-5) var(--space-3) var(--space-1-5) 0; text-align: left; font-family: var(--font-mono); font-weight: normal">{{ key }}</th>
          <td
            v-for="(name, code) of LOCALES"
            :key="code"
            :style="{ padding: 'var(--space-1-5) var(--space-3) var(--space-1-5) 0', color: values[code] ? 'var(--text-primary)' : 'var(--warning-text)' }"
          >{{ values[code] ?? 'missing' }}</td>
        </tr>
      </tbody>
    </table>
  `,
})

const panel = defineComponent({
  name: 'I18nPanel',
  props: { item: { type: String, default: null } },
  emits: ['item'],
  setup(props) {
    return { LOCALES, missing: computed(() => (props.item ? missingIn(props.item) : [])) }
  },
  template: `
    <p v-if="!item" style="margin: 0; color: var(--text-muted)">Choose a language to see what it lacks.</p>
    <template v-else>
      <p style="margin: 0 0 var(--space-2)">{{ LOCALES[item] }}: {{ missing.length }} missing</p>
      <code v-for="key of missing" :key="key" style="display: block; font-size: var(--text-xs)">{{ key }}</code>
    </template>
  `,
})

// Une vue sans panneau des stories : pas d'export par défaut.
export const view = { sidebar, canvas, panel }
