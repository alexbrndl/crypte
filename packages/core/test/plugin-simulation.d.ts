import type { PluginMessage } from '../src/protocol/channel'

// Simule des plugins installés, pour éprouver les points d'extension.
//
// Une augmentation vaut pour tout le programme compilé, pas pour le fichier qui
// la déclare : les regrouper ici rend visible le contexte de tous les tests.
//
// D'où trois programmes séparés. Celui-ci, avec plugins. `no-plugin.test.ts`,
// sans, qui compile ses `@ts-expect-error` hors de cette simulation ; une
// directive inutilisée étant elle-même une erreur, il échoue dans les deux sens.
// Et `packages/react/test/public-augmentation.ts`, qui passe par les `.d.ts`
// publiés, seul chemin où `@crypte/core/protocol` se résout comme chez un plugin.

declare module '../src/protocol/prop' {
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

declare module '../src/protocol/channel' {
  interface PluginShellMessages {
    controls: PluginMessage<{ type: 'controls:open'; open: boolean }>
    // Optionnel, comme les autres points d'extension le donnent en exemple.
    viewport?: PluginMessage<{ type: 'viewport:set'; width: number }>
  }

  interface PluginPreviewMessages {
    a11y: PluginMessage<{ type: 'a11y:report'; violations: string[] }>
    // Sans `PluginMessage`, et mal formé : le filtre doit l'écarter de l'union.
    // Voir `channel.test.ts`, qui échoue si ce n'est plus le cas.
    legacy: { type: string; payload: unknown }
  }
}

export {}
