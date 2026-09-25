import { defineComponent, ref } from 'vue'

// Un état propre au panneau : c'est lui qui cesse de redessiner quand le panneau
// tourne sur une autre copie de Vue que le shell, et le cas navigateur le clique.
// Un `template` plutôt que `h()` : il tient aussi le compilateur du Vue du shell.
export default defineComponent({
  name: 'HelloPanel',
  setup() {
    return { clicks: ref(0) }
  },
  template: '<button type="button" @click="clicks++">hello, {{ clicks }} clic(s)</button>',
})
