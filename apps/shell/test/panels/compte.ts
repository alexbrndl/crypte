import { defineComponent, h } from 'vue'

// Compte ses montages : un panneau gardé à la relecture de la liste reste à 1.
let montages = 0

export default defineComponent({
  setup() {
    montages += 1
    const vu = montages
    return () => h('p', String(vu))
  },
})
