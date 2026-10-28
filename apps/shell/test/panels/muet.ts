import { defineComponent, h, watchEffect } from 'vue'

// Sans objet tant que sa partie preview dit `muet:rien`. Affiche son numéro de
// montage : un panneau déplacé et non remonté le garde.
let montages = 0

export default defineComponent({
  props: ['received'],
  emits: ['inapplicable'],
  setup(props, { emit }) {
    montages += 1
    const vu = montages
    watchEffect(() =>
      emit(
        'inapplicable',
        (props.received as { type?: string } | null)?.type === 'muet:rien' ? 'rien' : null,
      ),
    )
    return () => h('p', `muet${vu}`)
  },
})
