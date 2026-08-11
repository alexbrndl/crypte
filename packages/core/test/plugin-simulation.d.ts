import type { PluginMessage } from '../src/protocol/channel'

// Simule des plugins installés, pour éprouver les points d'extension.
//
// Une augmentation vaut pour tout le programme compilé, pas pour le fichier qui
// la déclare : les regrouper ici rend visible le contexte de tous les tests.

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
  }

  interface PluginPreviewMessages {
    a11y: PluginMessage<{ type: 'a11y:report'; violations: string[] }>
  }
}

export {}
