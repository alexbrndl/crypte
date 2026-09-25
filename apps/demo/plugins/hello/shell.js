import { defineComponent, h, ref } from 'vue'

// Un état propre au panneau : c'est lui qui cesse de redessiner quand le panneau
// tourne sur une autre copie de Vue que le shell, et le cas navigateur le clique.
export default defineComponent({
  name: 'HelloPanel',
  setup() {
    const clicks = ref(0)

    return () =>
      h(
        'button',
        { type: 'button', onClick: () => clicks.value++ },
        `hello, ${clicks.value} clic(s)`,
      )
  },
})
