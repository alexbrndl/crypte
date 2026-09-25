import { defineComponent, watchEffect } from 'vue'

// Redit à chaque story qu'il est sans objet : le shell l'oublie à chaque
// changement de story.
export default defineComponent({
  name: 'StatusPanel',
  props: { entry: { type: Object, default: null } },
  emits: ['inapplicable'],
  setup(props, { emit }) {
    watchEffect(() => {
      if (!props.entry?.meta?.status) emit('inapplicable', 'aucun statut déclaré')
    })
  },
  template: '<p>statut : {{ entry?.meta?.status }}</p>',
})
