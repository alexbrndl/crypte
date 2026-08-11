// La dérivation des identifiants de story, seul code réellement exécuté du
// protocole. Consommé par le CLI qui écrit le manifeste, et par le shell qui lit
// l'identifiant depuis l'URL.

// Décompose les caractères accentués puis retire les diacritiques : « é » devient
// « e » plutôt que d'être remplacé par un tiret.
const DIACRITICS = /[̀-ͯ]/g
// Lettres, chiffres et marques de toutes les écritures, pas seulement l'alphabet
// latin. Restreindre à `a-z0-9` vidait tout nom écrit en cyrillique, en japonais
// ou en arabe, et faisait tomber deux stories distinctes sur le même identifiant.
// Les marques sont conservées parce qu'elles portent du sens hors du latin : sans
// elles, « が » perdrait son dakuten et deviendrait « か ».
const NON_ALPHANUMERIC = /[^\p{L}\p{N}\p{M}]+/gu
const EDGE_SEPARATORS = /^-+|-+$/g

export function normalizeSegment(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(DIACRITICS, '')
      .toLowerCase()
      .replace(NON_ALPHANUMERIC, '-')
      .replace(EDGE_SEPARATORS, '')
      // Recomposée, sinon deux identifiants d'apparence identique diffèrent octet à
      // octet et ne désignent plus le même fichier de baseline.
      .normalize('NFC')
  )
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
