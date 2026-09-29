import { defineComponent, ref } from 'vue'

// Un état propre au panneau : c'est lui qui cesse de redessiner quand le panneau
// tourne sur une autre copie de Vue que le shell, et le cas navigateur le clique.
// Un `template` plutôt que `h()` : il tient aussi le compilateur du Vue du shell.
// « ping » fait l'aller-retour avec la partie preview, qui répond `hello:pong`.
export default defineComponent({
  name: 'HelloPanel',
  props: {
    entry: { type: Object, default: null },
    received: { type: Object, default: null },
  },
  emits: ['send'],
  setup() {
    return { clicks: ref(0) }
  },
  template: `
    <button type="button" @click="clicks++">hello, {{ clicks }} clic(s)</button>
    <button type="button" @click="$emit('send', { type: 'hello:ping' })">ping</button>
    <output>{{ received?.type ?? '' }}</output>
  `,
})
