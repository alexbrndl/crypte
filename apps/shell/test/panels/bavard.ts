import { defineComponent, h } from 'vue'

// Un panneau qui écrit à sa partie preview dès son montage, sous son nom `e`.
export default defineComponent({
  emits: ['send'],
  setup(_, { emit }) {
    emit('send', { type: 'e:run' })
    return () => h('i', 'bavard')
  },
})
