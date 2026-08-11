// Décompose les caractères accentués puis retire les diacritiques : « é » devient
// « e » plutôt que d'être remplacé par un tiret.
const DIACRITICS = /[̀-ͯ]/g
const NON_ALPHANUMERIC = /[^a-z0-9]+/g
const EDGE_SEPARATORS = /^-+|-+$/g

export function normalizeSegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(EDGE_SEPARATORS, '')
}

// L'identifiant est dérivé du chemin de l'entrée et du nom de la story. C'est une
// donnée stable, pas un détail d'implémentation : il sert d'URL, de clé de baseline
// pour les tests visuels et de référence pour les commentaires.
//
// Renommer une story change son identifiant et casse sa baseline. Ce comportement
// est assumé et doit être documenté à l'utilisateur, pas contourné.
export function storyId(path: readonly string[], name: string): string {
  const prefix = path.map(normalizeSegment).filter(Boolean).join('/')
  const suffix = normalizeSegment(name)

  if (!prefix) return suffix
  return `${prefix}--${suffix}`
}
