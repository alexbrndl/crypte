// How a story identifier is derived, the only code the protocol runs.

// `é` becomes `e`, not a dash. On a latin base only: the same marks build `й`
// and `ё`, which would otherwise fall onto `и` and `е`.
const LATIN_DIACRITICS = /([a-z])[\u0300-\u036f]+/gi
// Every script, not just latin: `a-z0-9` gave `button--` for any cyrillic name.
// Marks stay, otherwise `が` becomes `か`.
const NON_ALPHANUMERIC = /[^\p{L}\p{N}\p{M}]+/gu
const EDGE_SEPARATORS = /^-+|-+$/g

export function normalizeSegment(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(LATIN_DIACRITICS, '$1')
      .toLowerCase()
      .replace(NON_ALPHANUMERIC, '-')
      .replace(EDGE_SEPARATORS, '')
      // Recomposed: otherwise two names that look the same point at two files.
      .normalize('NFC')
  )
}

// The identifier is a URL and a baseline key. Renaming a story changes it and
// breaks its baseline: accepted, and documented to the user.
export function storyId(path: readonly string[], name: string): string {
  const prefix = path.map(normalizeSegment).filter(Boolean).join('/')
  const suffix = normalizeSegment(name)

  if (!prefix) return suffix
  if (!suffix) return prefix
  return `${prefix}--${suffix}`
}
