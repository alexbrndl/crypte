import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BUDGETS,
  MARKER,
  MESURES,
  adapterLines,
  catalogOf,
  externalDeps,
  médiane,
  ownBytes,
  shellGzipBytes,
  table,
  treeBytes,
  verdicts,
} from './budgets.mjs'

// Les cinq budgets du produit. Ce qui compte ici est qu'une mesure absente ne
// puisse jamais passer pour un budget tenu : un dossier vide rendant zéro
// donnerait un verdict vert sur rien.
// Voir docs/internal/architecture.md.

const jetables = []

afterAll(() => {
  for (const un of jetables) rmSync(un, { recursive: true, force: true })
})

function dossierAvec(fichiers) {
  const racine = mkdtempSync(join(tmpdir(), 'crypte-budgets-'))

  for (const [nom, contenu] of Object.entries(fichiers)) {
    const cible = join(racine, nom)
    mkdirSync(join(cible, '..'), { recursive: true })
    writeFileSync(cible, contenu)
  }

  jetables.push(racine)

  return racine
}

describe('le poids du shell', () => {
  it('additionne tous les actifs, gzippés', () => {
    const racine = dossierAvec({ 'a.js': 'x'.repeat(500), 'b.css': 'y'.repeat(500) })
    const attendu =
      gzipSync(Buffer.from('x'.repeat(500)), { level: 9 }).length +
      gzipSync(Buffer.from('y'.repeat(500)), { level: 9 }).length

    expect(shellGzipBytes(racine)).toBe(attendu)
  })

  // Les cartes de source ne partent pas chez l'utilisateur, et elles pèsent
  // plus que le bundle : les compter tripleraient le chiffre.
  it('ne compte pas les cartes de source', () => {
    const seul = dossierAvec({ 'a.js': 'x'.repeat(500) })
    const avec = dossierAvec({ 'a.js': 'x'.repeat(500), 'a.js.map': 'z'.repeat(50_000) })

    expect(shellGzipBytes(avec)).toBe(shellGzipBytes(seul))
  })

  // Le cas qui compte. Sans lui, un lancement où `vp pack` n'a pas tourné rend
  // zéro octet, donc un budget de poids tenu par un bundle qui n'existe pas.
  it('lève plutôt que de rendre zéro sur un dossier absent', () => {
    expect(() => shellGzipBytes(join(dossierAvec({}), 'nulle-part'))).toThrow('vp run -r pack')
  })

  it('lève aussi sur un dossier qui n’a que des cartes', () => {
    expect(() => shellGzipBytes(dossierAvec({ 'a.js.map': 'z' }))).toThrow('aucun actif')
  })
})

describe('les lignes de l’adaptateur', () => {
  it('compte les lignes des sources TypeScript', () => {
    const racine = dossierAvec({ 'a.ts': 'un\ndeux\ntrois\n', 'b.tsx': 'quatre\n' })

    expect(adapterLines(racine)).toBe(4)
  })

  // Un fichier terminé par un saut de ligne n'a pas une ligne de plus.
  it('ne compte pas la ligne vide finale', () => {
    expect(adapterLines(dossierAvec({ 'a.ts': 'un\n' }))).toBe(1)
    expect(adapterLines(dossierAvec({ 'b.ts': 'un' }))).toBe(1)
  })

  it('ne lit que le TypeScript', () => {
    const racine = dossierAvec({ 'a.ts': 'un\n', 'lisez.md': 'x\ny\nz\n', 'b.js': 'w\n' })

    expect(adapterLines(racine)).toBe(1)
  })

  it('lève plutôt que de rendre zéro sur un dossier sans source', () => {
    expect(() => adapterLines(dossierAvec({ 'lisez.md': 'x' }))).toThrow('aucune source')
  })
})

describe('les octets d’un arbre', () => {
  it('additionne les fichiers de tous les niveaux', () => {
    const racine = dossierAvec({ 'a.txt': 'x'.repeat(10), 'sous/b.txt': 'y'.repeat(5) })

    expect(treeBytes(racine)).toBe(15)
  })

  // `npm install` écrit des liens dans `.bin`. Les suivre compterait deux fois
  // le fichier pointé, et un lien cassé ferait lever la mesure.
  it('rend la taille d’un fichier seul quand on le lui dit', () => {
    const racine = dossierAvec({ 'a.txt': 'x'.repeat(10) })

    expect(treeBytes(join(racine, 'a.txt'), true)).toBe(10)
  })

  it('ne suit pas les liens symboliques', () => {
    const racine = dossierAvec({ 'a.txt': 'x'.repeat(10) })
    symlinkSync(join(racine, 'a.txt'), join(racine, 'lien.txt'))
    symlinkSync(join(racine, 'absent.txt'), join(racine, 'cassé.txt'))

    expect(treeBytes(racine)).toBe(10)
  })
})

describe('le catalogue', () => {
  const yaml = [
    'packages:',
    '  - packages/*',
    '',
    'catalogMode: prefer',
    '',
    'catalog:',
    "  '@types/node': ^24",
    '  vite: ^8.2.1',
    '',
    '  typescript: 6.0.3',
    '',
    'onlyBuiltDependencies:',
    '  - esbuild',
  ].join('\n')

  it('lit les noms cités et les noms nus', () => {
    expect(catalogOf(yaml)).toEqual({ '@types/node': '^24', vite: '^8.2.1', typescript: '6.0.3' })
  })

  // `catalogMode:` commence par les mêmes huit lettres. Le prendre pour le bloc
  // rendrait un catalogue d'une entrée, et toutes les versions seraient fausses.
  it('ne prend pas catalogMode pour le bloc', () => {
    expect(catalogOf(yaml)).not.toHaveProperty('prefer')
  })

  it('s’arrête à la première clé de premier niveau', () => {
    expect(catalogOf(yaml)).not.toHaveProperty('- esbuild')
  })

  it('lève plutôt que de rendre un catalogue vide', () => {
    expect(() => catalogOf('packages:\n  - a\n')).toThrow('aucun bloc')
    expect(() => catalogOf('catalog:\nautre: 1\n')).toThrow('vide')
  })

  // Le fichier réel, sinon les cas ci-dessus n'éprouvent que leur propre
  // fixture et le motif peut cesser de lire la forme que le dépôt écrit.
  it('lit le fichier du dépôt', () => {
    const lu = catalogOf(readFileSync(join(process.cwd(), 'pnpm-workspace.yaml'), 'utf8'))

    expect(Object.keys(lu).length).toBeGreaterThan(5)
    expect(lu.vite).toMatch(/^\^?\d/)
  })
})

describe('les dépendances externes', () => {
  const catalogue = { vite: '^8.2.1', tsconfck: '^3.1.6' }

  it('écarte nos propres paquets et résout le catalogue', () => {
    expect(externalDeps(['cli', 'react'], catalogue)).toEqual({
      sirv: expect.stringMatching(/^\^?\d/),
      tsconfck: '^3.1.6',
      vite: '^8.2.1',
    })
  })

  // Sans ce cas, un nom que le catalogue ne porte plus donnerait `undefined`
  // dans le package.json écrit, et npm installerait la dernière version.
  it('lève sur un nom que le catalogue ne porte pas', () => {
    expect(() => externalDeps(['cli'], { vite: '^8' })).toThrow('tsconfck')
  })
})

describe('nos propres octets', () => {
  // `vp run -r pack` a tourné avant : sinon le chiffre est celui du manifeste
  // seul, et le budget se tiendrait sur un paquet vide.
  it('comptent le dist et le manifeste de chaque paquet', () => {
    expect(ownBytes(['react'])).toBeGreaterThan(1000)
    expect(ownBytes(['react', 'core'])).toBeGreaterThan(ownBytes(['react']))
  })
})

describe('la médiane', () => {
  it('prend la valeur du milieu, quel que soit l’ordre donné', () => {
    expect(médiane([700, 200, 300])).toBe(300)
    expect(médiane([300, 700, 200])).toBe(300)
  })

  // Un seul lancement reste sa propre médiane, et un compte pair prend le bas
  // du milieu : sur une machine partagée, mieux vaut le pessimisme du bas que
  // la moyenne, qu'un unique lancement lent tire.
  it('tient sur un compte impair comme pair', () => {
    expect(médiane([500])).toBe(500)
    expect(médiane([200, 400])).toBe(200)
  })

  it('arrondit', () => {
    expect(médiane([300.4])).toBe(300)
  })
})

describe('le verdict', () => {
  const budgets = { startMs: 1000, adapterLines: 500 }

  it('tient une mesure sous la cible', () => {
    expect(verdicts({ startMs: 999, adapterLines: 1 }, budgets).every((one) => one.tenu)).toBe(true)
  })

  // « moins de 1,5 s » se lit comme une borne atteinte, pas dépassée.
  it('tient une mesure pile à la cible', () => {
    expect(verdicts({ startMs: 1000, adapterLines: 500 }, budgets).map((one) => one.tenu)).toEqual([
      true,
      true,
    ])
  })

  it('ne tient pas une mesure d’un point au-dessus', () => {
    expect(verdicts({ startMs: 1001, adapterLines: 500 }, budgets).map((one) => one.tenu)).toEqual([
      false,
      true,
    ])
  })

  // Une mesure absente n'est pas une mesure tenue. Sans ce cas, une étape qui
  // n'a pas tourné rendrait le tableau vert.
  it('ne tient pas une mesure absente', () => {
    expect(verdicts({ adapterLines: 1 }, budgets)[0]).toMatchObject({
      mesure: undefined,
      tenu: false,
    })
  })
})

describe('le tableau', () => {
  const rendus = verdicts({ startMs: 600, adapterLines: 900 }, { startMs: 1500, adapterLines: 500 })

  it('commence par le marqueur, seul sur sa première ligne', () => {
    expect(table(rendus).split('\n')[0]).toBe(MARKER)
  })

  it('marque ce qui tient et ce qui ne tient pas', () => {
    const corps = table(rendus)

    expect(corps).toContain('| Démarrage à froid | 600 ms | 1500 ms | 60 % | ✅ |')
    expect(corps).toContain('| Adaptateur React | 900 lignes | 500 lignes | -80 % | ❌ |')
  })

  it('dit tiret plutôt que zéro sur une mesure absente', () => {
    expect(table(verdicts({}, { startMs: 1500 }))).toContain('| Démarrage à froid | — | 1500 ms |')
  })
})

// Un budget sans libellé rendrait `undefined` dans le tableau, et un libellé
// sans budget ne serait jamais mesuré. Les deux listes se tiennent l'une
// l'autre plutôt que d'être relues.
describe('les budgets déclarés', () => {
  it('ont chacun leur libellé, et réciproquement', () => {
    expect(Object.keys(BUDGETS).sort((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(MESURES).sort((a, b) => a.localeCompare(b)),
    )
  })

  it('sont tous des nombres positifs', () => {
    for (const [clé, valeur] of Object.entries(BUDGETS)) {
      expect(typeof valeur, clé).toBe('number')
      expect(valeur, clé).toBeGreaterThan(0)
    }
  })
})
