import { defineComponent, h } from 'vue'

// Un panneau des stories, et une vue dont le canvas n'est pas un composant.
export default defineComponent({ render: () => h('i', 'panneau') })

export const view = { canvas: 42 }
