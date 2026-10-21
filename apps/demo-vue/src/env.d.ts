// Le contrôle de types du dépôt ne lit pas un `.vue` : sans ce module, chaque
// import de composant serait une erreur. Ses props sont ouvertes, faute de les
// connaître ; un projet Vue les obtient de `vue-tsc`, qui lit le fichier.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>>
  export default component
}
