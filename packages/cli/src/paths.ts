// Les chemins déclarés par le projet, appliqués comme TypeScript les applique.
// Crypte ne lit jamais le `vite.config` d'un projet : voir la section 1.5.

import { isAbsolute, resolve } from 'node:path'
import type { Plugin } from 'vite'

export interface ProjectPaths {
  paths: Record<string, string[]>
  // Le dossier depuis lequel les cibles se comptent.
  base: string
  // Les fichiers lus pour arriver là, à surveiller comme la configuration.
  files: string[]
}

// Un identifiant porté par un protocole : `https:`, `data:`, `node:`, et les
// modules virtuels qu'un plugin déclare, `virtual:` par convention.
const PROTOCOL = /^[a-z][a-z\d+.-]*:/i

// Le préfixe des identifiants virtuels de Rollup.
const VIRTUAL = '\0'

// Un plugin plutôt que des `resolve.alias` : un alias réécrit sans condition, là
// où TypeScript essaie la cible et retombe sur la résolution normale quand elle
// n'existe pas. Ce repli est toute la différence, et il n'a pas d'équivalent
// dans `resolve.alias`. Voir architecture.md.
export function pathsPlugin({ paths, base }: ProjectPaths): Plugin {
  // TypeScript départage deux motifs par la longueur de leur préfixe fixe, et
  // un motif sans joker l'emporte sur tous. Sans cet ordre, `@/*` gagne sur
  // `@/lib/*` dès que les deux cibles existent.
  const ordered = Object.entries(paths).sort(([a], [b]) => {
    const parPrefixe = prefixOf(b).length - prefixOf(a).length
    if (parPrefixe !== 0) return parPrefixe

    // À égalité de préfixe, le motif sans joker l'emporte : `#app` avant `#app*`.
    return Number(a.includes('*')) - Number(b.includes('*'))
  })

  return {
    name: 'crypte:paths',
    async resolveId(source, importer, options) {
      // TypeScript n'applique `paths` qu'aux identifiants de module nus. Ce
      // résolveur passant après ceux de Vite, tout le reste ne lui parvient que
      // **cassé** ou non résolu ailleurs : le capturer ferait charger un autre
      // module au lieu d'échouer. Mesuré sur un `./theme.css` supprimé.
      if (!isBareSpecifier(source)) return null

      for (const [pattern, targets] of ordered) {
        const captured = capture(pattern, source)
        if (captured === null) continue

        for (const target of targets) {
          // La résolution est celle de Vite : extensions du projet, `index`,
          // champ `exports`, conditions. Rien n'est réimplémenté ici.
          // Un remplaçant en fonction : la forme chaîne interpréterait `$&` et
          // ses semblables dans la partie capturée, qui vient de l'utilisateur.
          const candidate = resolve(
            base,
            target.replace('*', () => captured),
          )
          const found = await this.resolve(candidate, importer, {
            ...options,
            skipSelf: true,
          })

          if (found) return found
        }
      }

      // Aucun motif ne s'applique, ou aucune cible n'existe : Vite poursuit.
      return null
    },
  }
}

// Ce à quoi les chemins s'appliquent : un nom de module, et rien d'autre. Les
// autres natures appartiennent à Vite, à un plugin, ou au système de fichiers.
export function isBareSpecifier(id: string): boolean {
  if (id.startsWith('.') || id.startsWith(VIRTUAL)) return false
  if (isAbsolute(id)) return false

  return !PROTOCOL.test(id)
}

// Un motif porte au plus un joker : le faire correspondre revient à comparer un
// préfixe et un suffixe, et à rendre ce qu'il y a entre les deux.
//
// Exporté pour être éprouvé seul : une correspondance fautive ne se voit pas de
// l'extérieur, le repli renvoyant simplement l'import à Vite.
export function capture(pattern: string, id: string): string | null {
  const star = pattern.indexOf('*')
  if (star === -1) return id === pattern ? '' : null

  const before = pattern.slice(0, star)
  const after = pattern.slice(star + 1)
  if (id.length < before.length + after.length) return null
  if (!id.startsWith(before) || !id.endsWith(after)) return null

  return id.slice(before.length, id.length - after.length)
}

function prefixOf(pattern: string): string {
  const star = pattern.indexOf('*')
  return star === -1 ? pattern : pattern.slice(0, star)
}
