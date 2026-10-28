import { Button } from '@crypte/ui'
import { defineComponent, ref } from 'vue'

// Un état propre au panneau : c'est lui qui cesse de redessiner quand le panneau
// tourne sur une autre copie de Vue que le shell, et le cas navigateur le clique.
// Un `template` plutôt que `h()` : il tient aussi le compilateur du Vue du shell.
// « ping » fait l'aller-retour avec la partie preview, qui répond `hello:pong`.
// `Button` vient de `@crypte/ui` par l'import map du shell, comme `vue`.
export default defineComponent({
  name: 'HelloPanel',
  components: { Button },
  props: {
    entry: { type: Object, default: null },
    received: { type: Object, default: null },
  },
  emits: ['send'],
  setup() {
    return { clicks: ref(0) }
  },
  template: `
    <div style="display: flex; gap: var(--space-2); align-items: center">
      <Button @click="clicks++">hello, {{ clicks }} clic(s)</Button>
      <Button @click="$emit('send', { type: 'hello:ping' })">ping</Button>
      <output>{{ received?.type ?? '' }}</output>
    </div>
  `,
})
