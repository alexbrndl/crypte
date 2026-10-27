import type { CryptePlugin } from '@crypte/cli'

// Le panneau qui n'a rien à dire sur une partie des stories : celles de `Tag`
// ne déclarent pas de statut. C'est lui qui tient le panneau sans objet.
export default function status(): CryptePlugin {
  return {
    name: 'status',
    shell: new URL('./shell.js', import.meta.url).href,
  }
}
