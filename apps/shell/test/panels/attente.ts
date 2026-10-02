import { defineComponent, h } from 'vue'

// Ce qu'un panneau reçoit avant que sa partie preview ait parlé. Sans type ni
// défaut, pour lire la valeur telle que le cadre la passe.
export default defineComponent({
  props: ['received'],
  setup(props) {
    return () => h('p', props.received === null ? 'null' : String(props.received))
  },
})
