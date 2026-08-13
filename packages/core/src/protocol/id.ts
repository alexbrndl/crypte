// La dérivation des identifiants de story, seul code exécuté du protocole.

// « é » devient « e », pas un tiret. Seulement sur une base latine : les mêmes
// marques composent « й » et « ё », qui tomberaient sinon sur « и » et « е ».
const LATIN_DIACRITICS = /([a-z])[\u0300-\u036f]+/gi
// Toutes les écritures, pas seulement le latin : `a-z0-9` donnait `button--` pour
// tout nom cyrillique. Les marques restent, sinon « が » devient « か ».
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
      // Recomposée : sinon deux noms identiques à l'œil désignent deux fichiers.
      .normalize('NFC')
  )
}

// L'identifiant sert d'URL et de clé de baseline. Renommer une story change son
// identifiant et casse sa baseline : assumé, à documenter à l'utilisateur.
export function storyId(path: readonly string[], name: string): string {
  const prefix = path.map(normalizeSegment).filter(Boolean).join('/')
  const suffix = normalizeSegment(name)

  if (!prefix) return suffix
  if (!suffix) return prefix
  return `${prefix}--${suffix}`
}

// Ligne temporaire : éprouve le contrôle require-changeset. À supprimer.
