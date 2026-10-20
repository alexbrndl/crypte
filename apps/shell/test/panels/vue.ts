import { defineComponent, h } from 'vue'

// Une vue seule : pas de panneau des stories, donc pas d'export par défaut.
const partie = (nom: string) => defineComponent({ render: () => h('i', nom) })

export const view = { canvas: partie('canvas'), sidebar: partie('sidebar'), panel: partie('panel') }
