// Les messages échangés entre le shell et la preview. Rien d'autre ne traverse
// la frontière.

export type ShellMessage =
  | { type: 'render'; id: string; overrides: Overrides }
  | { type: 'update-overrides'; id: string; overrides: Overrides }
  | { type: 'set-globals'; globals: Record<string, unknown> }
  | MessagesOf<PluginShellMessages>

export type PreviewMessage =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'rendered'; id: string; durationMs: number }
  | { type: 'error'; id: string; message: string; stack?: string }
  | MessagesOf<PluginPreviewMessages>

// Ne retient que ce qui a la forme d'un message, `type` compris comme littéral.
// `NonNullable` parce qu'un membre optionnel vaut `X | undefined`, qui n'a pas
// cette forme : sans lui, `controls?: …` disparaît de l'union alors que les
// autres points d'extension donnent justement l'exemple d'un champ optionnel.
// Sans ce filtre, un plugin déclarant `{ x: string }` ou `{ type: string }`
// ferait entrer sa valeur dans l'union, et plus aucun `message.type` ne
// distinguerait quoi que ce soit chez le consommateur.
type MessagesOf<T> = {
  [K in keyof T]: NonNullable<T[K]> extends { type: infer Kind }
    ? string extends Kind
      ? never
      : NonNullable<T[K]>
    : never
}[keyof T]

// Le canal ne transporte jamais les props d'une story : la preview importe les
// modules directement. Il transporte les valeurs éditées dans un panneau.
export type Overrides = Record<string, unknown>

export const PROTOCOL_VERSION = 1

// Vides ici. Un plugin y déclare ses messages par augmentation de module, en
// passant par `PluginMessage` pour être averti à la ligne s'il se trompe :
// `declare module '@crypte/core/protocol' { interface PluginShellMessages { x: PluginMessage<{ type: 'x' }> } }`
export interface PluginShellMessages {}
export interface PluginPreviewMessages {}

// La contrainte porte sur le paramètre, donc l'erreur tombe sur la déclaration
// plutôt qu'à l'usage. Rien n'oblige un plugin à l'employer : `MessagesOf` reste
// le filet pour ceux qui déclarent sans.
type LiteralOnly<K> = string extends K ? 'le champ `type` doit être un littéral' : K

export type PluginMessage<T extends { type: LiteralOnly<T['type']> }> = T
