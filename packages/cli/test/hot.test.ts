import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Manifest } from '@crypte/core/protocol'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDev, type Started } from '../src/dev'
import { MANIFEST_ROUTE } from '../src/serve'

// Ce que le serveur fait des fichiers pendant qu'il tourne. Sur une copie de la
// fixture : ces cas écrivent des fichiers de story, et la fixture est commitée.
//
// La copie reste dans l'espace de travail, pas dans `os.tmpdir()` : hors du
// dépôt, `crypte.config.ts` ne résout plus `@crypte/cli`. Mesuré.
// Voir docs/internal/architecture.md.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture')

describe('le catalogue pendant que le serveur tourne', () => {
  let started: Started
  let origin: string
  let root: string

  beforeAll(async () => {
    root = mkdtempSync(join(fixture, '..', 'tmp-hot-'))
    cpSync(fixture, root, { recursive: true })

    started = await startDev(root)
    await started.server.listen()

    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    origin = `http://localhost:${address.port}`
  }, 30_000)

  afterAll(async () => {
    await started?.server.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  async function names(): Promise<string[]> {
    const manifest = (await fetch(`${origin}${MANIFEST_ROUTE}`).then((answer) =>
      answer.json(),
    )) as Manifest

    return manifest.entries.map((entry) => entry.id)
  }

  const story = (component: string) =>
    [
      `import { ${component} } from '@/components/Badge'`,
      '',
      `export default defineStories(${component})`,
    ].join('\n')

  it('sert le catalogue du démarrage', async () => {
    expect(await names()).toContain('badge--default')
  })

  // La route lit le catalogue à chaque requête. Capturé au démarrage, il
  // laisserait le shell sur l'arbre d'il y a une heure.
  it('fait apparaître un fichier de story ajouté', { timeout: 20_000 }, async () => {
    writeFileSync(join(root, 'stories', 'Ajoutee.js'), story('Badge'))

    await expect.poll(names, { timeout: 10_000 }).toContain('ajoutee--default')
  })

  it('fait disparaître un fichier de story retiré', { timeout: 20_000 }, async () => {
    rmSync(join(root, 'stories', 'Ajoutee.js'))

    await expect.poll(names, { timeout: 10_000 }).not.toContain('ajoutee--default')
  })

  // Deux fichiers du même dossier au même nom de base portent le même
  // identifiant, ce qu'un `crypte dev` rencontre pendant qu'on convertit un
  // fichier. La reconstruction lève, et garder le dernier catalogue bon est la
  // différence entre une sauvegarde qui clignote et un serveur qui s'arrête.
  it('garde le catalogue quand la reconstruction échoue', async () => {
    const before = await names()

    writeFileSync(join(root, 'stories', 'Badge.jsx'), story('Badge'))
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(await names()).toEqual(before)

    rmSync(join(root, 'stories', 'Badge.jsx'))
  })

  // Le module virtuel de l'entrée nomme ses imports un par un : sans
  // invalidation il resservirait la liste d'avant, donc une story visible dans
  // l'arbre et introuvable au rendu.
  it('réécrit l’entrée de la preview après un ajout', { timeout: 20_000 }, async () => {
    writeFileSync(join(root, 'stories', 'Tardive.js'), story('Badge'))
    await expect.poll(names, { timeout: 10_000 }).toContain('tardive--default')

    const source = await fetch(`${origin}/@crypte/preview.js`).then((answer) => answer.text())

    expect(source).toContain('Tardive.js')
  })
})
