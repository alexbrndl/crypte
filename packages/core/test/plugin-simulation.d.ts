// Simule un plugin installé, pour éprouver les points d'extension du protocole.
//
// Une augmentation de module vaut pour TOUT le programme compilé, pas pour le seul
// fichier qui la déclare. La regrouper ici évite qu'un test dépende en silence de
// l'augmentation écrite dans un autre, et rend visible le contexte dans lequel
// tous les tests s'exécutent : celui d'un projet où `@crypte/controls` et un
// plugin d'affichage sont installés.

declare module '../src/protocol/manifest' {
  interface PluginPropDetails {
    min?: number
    max?: number
    step?: number
    control?: false
  }
}

declare module '../src/protocol/story' {
  interface PluginStoryOptions {
    responsive?: 'mobile' | 'desktop'
  }
}

export {}
