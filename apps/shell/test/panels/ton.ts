import { defineComponent, h } from 'vue'

// Un second panneau qui édite, une prop à lui et une que l'éditeur édite aussi.
export default defineComponent({
  emits: ['overrides'],
  setup(_, { emit }) {
    emit('overrides', { tone: 'warning', label: 'du ton' })
    return () => h('i', 'ton')
  },
})
