// The messages the shell and the preview exchange. Nothing else crosses the
// boundary.

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

// Keeps only what has the shape of a message, with `type` as a literal.
// `-?` drops the optional modifier this mapped type would otherwise keep: an
// `controls?: …` member would let `undefined` into the union, and no
// `message.type` would narrow for the consumer. `NonNullable` handles the same
// case on the value side, so the member is kept rather than dropped.
// Without this filter, a plugin declaring `{ x: string }` or `{ type: string }`
// would push its value into the union, and `message.type` would stop telling
// anything apart.
type MessagesOf<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends { type: infer Kind }
    ? string extends Kind
      ? never
      : NonNullable<T[K]>
    : never
}[keyof T]

// The channel never carries a story's props: the preview imports the modules
// itself. It carries the values edited in a panel.
export type Overrides = Record<string, unknown>

export const PROTOCOL_VERSION = 1

// Empty here. A plugin declares its messages by module augmentation, going
// through `PluginMessage` to be told on the line where it gets it wrong:
// `declare module '@crypte/core/protocol' { interface PluginShellMessages { x: PluginMessage<{ type: 'x' }> } }`
export interface PluginShellMessages {}
export interface PluginPreviewMessages {}

// The constraint sits on the parameter, so the error lands on the declaration
// rather than at the point of use. Nothing forces a plugin to use it:
// `MessagesOf` stays the net for those who declare without.
type LiteralOnly<K> = string extends K ? 'the `type` field must be a literal' : K

export type PluginMessage<T extends { type: LiteralOnly<T['type']> }> = T
