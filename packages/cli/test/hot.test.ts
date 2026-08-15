import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
  const lines: string[] = []

  beforeAll(async () => {
    root = mkdtempSync(join(fixture, '..', 'tmp-hot-'))
    cpSync(fixture, root, { recursive: true })

    started = await startDev(root, (line) => lines.push(line))
    await started.server.listen()

    const address = started.server.httpServer?.address()
    if (typeof address !== 'object' || address === null) throw new Error('serveur sans adresse')

    origin = `http://localhost:${address.port}`
  }, 30_000)

  afterAll(async () => {
    await started?.server.close()
    if (root) rmSync(root, { recursive: true, force: true })
  })

  const story = (component: string) =>
    [
      `import { ${component} } from '@/components/Badge'`,
      '',
      `export default defineStories(${component})`,
    ].join('\n')

  async function names(): Promise<string[]> {
    const manifest = (await fetch(`${origin}${MANIFEST_ROUTE}`).then((answer) =>
      answer.json(),
    )) as Manifest

    return manifest.entries.map((entry) => entry.id)
  }

  it('sert le catalogue du démarrage', async () => {
    expect(await names()).toContain('badge--default')
  })

  // La forme décide du rechargement, jamais de la fraîcheur du catalogue :
  // éditer les props d'une story ne change pas l'arbre, et rendre la main ici
  // servait les props d'avant l'édition. Mesuré.
  it('sert les props à jour même quand l’arbre ne bouge pas', async () => {
    const file = join(root, 'stories', 'Badge.js')
    const before = readFileSync(file, 'utf8')

    writeFileSync(
      file,
      before.replace(
        'defineStories(Badge)',
        "defineStories(Badge, { props: { tone: 'warning' } })",
      ),
    )

    await expect
      .poll(
        async () => {
          const manifest = (await fetch(`${origin}${MANIFEST_ROUTE}`).then((answer) =>
            answer.json(),
          )) as Manifest

          return manifest.entries.find((entry) => entry.id === 'badge--default')?.props ?? []
        },
        { timeout: 10_000 },
      )
      .toContain('tone')

    writeFileSync(file, before)
  }, 20_000)

  // Chokidar suit les liens et rend le chemin réel. Sans cette forme dans le
  // filtre, une racine derrière un lien ne reconstruit jamais, sans un mot :
  // mesuré, la story ajoutée n'arrivait pas.
  it('reconstruit sur une racine derrière un lien symbolique', { timeout: 30_000 }, async () => {
    const link = join(fixture, '..', 'tmp-hot-lien')
    rmSync(link, { force: true })
    symlinkSync(root, link)

    const behind = await startDev(link)
    await behind.server.listen()

    try {
      writeFileSync(join(link, 'stories', 'Liee.js'), story('Badge'))

      await expect
        .poll(() => behind.held.catalogue.manifest.entries.map((entry) => entry.id), {
          timeout: 15_000,
        })
        .toContain('liee--default')
    } finally {
      await behind.server.close()
      rmSync(join(root, 'stories', 'Liee.js'), { force: true })
      rmSync(link, { force: true })
    }
  })

  // À partir d'ici les cas écrivent, et l'ordre compte : chaque écriture laisse
  // une reconstruction en cours, qui peut atterrir pendant le cas suivant. Ceux
  // qui lisent le catalogue tel qu'il est au démarrage passent donc devant.

  // Un fichier que le lecteur cesse de lire disparaît de l'arbre, et l'écran se
  // recharge : sans une ligne, l'auteur voit sa story partir sans savoir
  // pourquoi. C'est le silence que le lot 4 a fermé, rouvert par l'édition.
  it('dit ce qu’un fichier de story a cessé de produire', async () => {
    writeFileSync(join(root, 'stories', 'Muette.js'), 'export default 12')

    await expect
      .poll(() => lines.filter((line) => line.includes('Muette.js')), { timeout: 10_000 })
      .not.toEqual([])

    rmSync(join(root, 'stories', 'Muette.js'))
  }, 20_000)

  // Répétée à chaque frappe, la liste entière enterrerait ce qui vient
  // d'apparaître.
  it('ne répète pas ce qu’il a déjà dit', async () => {
    writeFileSync(join(root, 'stories', 'Muette.js'), 'export default 12')
    await expect
      .poll(() => lines.filter((line) => line.includes('Muette.js')).length, { timeout: 10_000 })
      .toBe(1)

    writeFileSync(join(root, 'stories', 'Autre.js'), story('Badge'))
    await expect.poll(names, { timeout: 10_000 }).toContain('autre--default')

    expect(lines.filter((line) => line.includes('Muette.js'))).toHaveLength(1)

    rmSync(join(root, 'stories', 'Muette.js'))
    rmSync(join(root, 'stories', 'Autre.js'))
  }, 30_000)

  // Une ligne qui reste dite pour toujours laisse la deuxième occurrence de la
  // même faute passer en silence, ce qui est le silence que ce lot ferme.
  it('redit ce qu’un fichier réparé casse à nouveau', async () => {
    const cassee = join(root, 'stories', 'Reparee.js')

    writeFileSync(cassee, 'export default 12')
    await expect
      .poll(() => lines.filter((line) => line.includes('Reparee.js')).length, { timeout: 10_000 })
      .toBe(1)

    writeFileSync(cassee, story('Badge'))
    await expect.poll(names, { timeout: 10_000 }).toContain('reparee--default')

    writeFileSync(cassee, 'export default 12')
    await expect
      .poll(() => lines.filter((line) => line.includes('Reparee.js')).length, { timeout: 10_000 })
      .toBe(2)

    rmSync(cassee)
  }, 40_000)

  // Reconstruire lève ici, donc rien ne remplace le catalogue : le dire est la
  // différence entre un arbre qui ne bouge plus et un arbre qui explique.
  it('dit qu’une reconstruction a échoué', async () => {
    writeFileSync(join(root, 'stories', 'Badge.jsx'), story('Badge'))

    await expect
      .poll(() => lines.filter((line) => line.includes('keeping the last good one')), {
        timeout: 10_000,
      })
      .not.toEqual([])

    rmSync(join(root, 'stories', 'Badge.jsx'))
  }, 20_000)

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

    const dites = lines.length

    writeFileSync(join(root, 'stories', 'Badge.jsx'), story('Badge'))

    // La ligne d'échec plutôt qu'un délai : sous charge, une attente plate
    // laisserait le cas conclure avant que la reconstruction ait eu lieu.
    await expect
      .poll(() => lines.slice(dites).some((line) => line.includes('keeping the last good one')), {
        timeout: 15_000,
      })
      .toBe(true)

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
