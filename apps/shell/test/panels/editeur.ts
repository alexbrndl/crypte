import { defineComponent, h } from 'vue'

// Un panneau qui édite dès son montage, comme `controls` au premier champ saisi.
export default defineComponent({
  emits: ['overrides'],
  setup(_, { emit }) {
    emit('overrides', { label: 'édité' })
    return () => h('i', 'éditeur')
  },
})
