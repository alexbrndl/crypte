// What can be said about a design token, once a plugin has read and resolved it.

export interface TokenValue {
  type: TokenKind
  description?: string
  // Keyed by theme name. A single-theme project holds one key, so a reader never
  // has two shapes to handle. The producer guarantees at least one, see 4.2.
  themes: Record<string, TokenInTheme>
}

// One theme's answer for one token.
export interface TokenInTheme {
  // Always set: a swatch renders from this alone, never by walking `alias`.
  value: string
  // The names walked to reach `value`, from the token towards the literal.
  // Absent, never empty, when the token holds a literal itself.
  alias?: string[]
}

// A kind the reader could not place gives `unknown` rather than nothing, as
// `PropKind` does: the token keeps its value and still renders.
export type TokenKind = 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'number' | 'unknown'
