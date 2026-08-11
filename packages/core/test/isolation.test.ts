import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

// Les trois formes qu'un bundle peut produire : réexport, import d'effet de bord,
// et import dynamique. N'en couvrir qu'une laisserait une porte de sortie hors de
// la fermeture, donc hors du contrôle.
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g

// Ce que produit le pack pour une entrée : son fichier, plus tout ce qu'il atteint
// par imports relatifs. Une entrée découpée en plusieurs fichiers sources réexporte
// depuis un chunk, ce qui est légitime ; ce qui ne l'est pas, c'est que ce chunk
// contienne le code d'une autre entrée.
function closureOf(entry: string): string {
  const start = join(dist, `${entry}.js`)
  expect(existsSync(start), `${entry}.js absent : lance \`vp pack\` avant \`vp test\``).toBe(true)

  const seen = new Set<string>()
  const queue = [start]
  let source = ''

  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)

    // Le motif peut aussi reconnaître un chemin à l'intérieur d'une chaîne du
    // bundle, qui ne désigne alors aucun fichier. Ignorer ce qui n'existe pas
    // vaut mieux que mourir sur un ENOENT sans rapport avec l'isolation : la
    // seule absence qui doit faire échouer le test est celle de l'entrée.
    if (!existsSync(file)) continue

    const content = readFileSync(file, 'utf8')
    source += content

    for (const match of content.matchAll(RELATIVE_IMPORT)) {
      const target = match[1]
      if (target) queue.push(join(dirname(file), target))
    }
  }

  return source
}

describe('isolation des entrées de @crypte/core', () => {
  // Le test porte sur ce que l'entrée atteint réellement, pas sur la forme de ses
  // imports. Une version antérieure interdisait tout import relatif : elle est
  // devenue inopérante dès que protocol a été découpé en plusieurs fichiers.
  it('protocol ne contient rien de ui ni de preview', () => {
    const protocol = closureOf('protocol')
    expect(protocol).not.toContain('__crypte_ui__')
    expect(protocol).not.toContain('__crypte_preview__')
  })

  it('la fermeture de protocol reste close', () => {
    const protocol = closureOf('protocol')
    expect(protocol).not.toContain('createShellChannel')
    expect(protocol).not.toContain('createPreviewChannel')
  })

  // Contrôle négatif, et il doit porter sur `protocol` : c'est la seule entrée
  // dont le fichier ne contient rien. Le pack en fait un talon de deux cents
  // octets qui réexporte depuis un chunk, si bien que les deux assertions
  // ci-dessus reposent entièrement sur le suivi des imports. Que celui-ci cesse
  // de résoudre — extension changée, spécificateur non relatif, import calculé —
  // et elles passeraient toutes deux sur ce talon vide, sans rien vérifier.
  //
  // Le faire sur `ui` ne prouverait rien : son fichier est autonome, marqueur
  // compris, donc il rend son contenu sans jamais exercer la boucle.
  // La chaîne cherchée est prise dans le **corps** de `normalizeSegment`, pas
  // dans son nom : le talon cite les noms qu'il réexporte, donc les chercher
  // reviendrait à se contenter du talon, précisément ce que ce contrôle existe
  // pour écarter. Seul le chunk contient l'implémentation.
  it('la fermeture de protocol contient bien le code de ses fonctions', () => {
    expect(closureOf('protocol')).toContain('NFD')
  })

  it('la fermeture de ui contient bien son propre marqueur', () => {
    expect(closureOf('ui')).toContain('__crypte_ui__')
  })
})
