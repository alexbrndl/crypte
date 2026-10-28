import type { CryptePlugin } from '@crypte/cli'

// Le plus petit plugin qui tient les deux surfaces navigateur : un bouton dans le
// shell, une marque posée dans l'iframe. Ses modules sont servis tels quels, sans
// compilation, d'où du JavaScript sans SFC.
export default function hello(): CryptePlugin {
  return {
    name: 'hello',
    shell: new URL('./shell.js', import.meta.url).href,
    preview: new URL('./preview.js', import.meta.url).href,
  }
}
