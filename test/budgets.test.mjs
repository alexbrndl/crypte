import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import {
  PAQUETS,
  adapterLines,
  externalDeps,
  médiane,
  ownBytes,
  shellGzipBytes,
  treeBytes,
  verdicts,
} from './budgets.mjs'

// Les cinq budgets du produit. Ce qui compte ici est qu'une mesure absente ne
// puisse jamais passer pour un budget tenu : un dossier vide rendant zéro
// donnerait un verdict vert sur rien.

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

  // Le cas qui compte. Sans lui, un lancement où `vp pack` n'a pas tourné rend
  // zéro octet, donc un budget de poids tenu par un bundle qui n'existe pas.
  it('lève plutôt que de rendre zéro sur un dossier absent', () => {
    expect(() => shellGzipBytes(join(dossierAvec({}), 'nulle-part'))).toThrow('vp run -r pack')
  })
})

describe('les lignes de l’adaptateur', () => {
  it('compte les lignes des sources TypeScript', () => {
    const racine = dossierAvec({ 'a.ts': 'un\ndeux\ntrois\n', 'b.tsx': 'quatre\n' })

    expect(adapterLines(racine)).toBe(4)
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
})

describe('les dépendances externes', () => {
  const catalogue = { vite: '^8.2.1', tsconfck: '^3.1.6' }

  // Épinglées sur ce qui est installé, jamais laissées en portée : sinon le
  // registre décide le jour du lancement, et une version mineure de Vite fait
  // rougir un contrôle requis sur un commit qui n'a rien changé.
  it('épingle chaque version sur celle que le dépôt a installée', () => {
    const lu = externalDeps(PAQUETS, catalogue)

    // Exactes, sans accent circonflexe ni tilde : c'est là toute la garantie.
    for (const [nom, version] of Object.entries(lu)) expect(version, nom).toMatch(/^\d+\.\d+\.\d+/)

    // Et bien celles qui sont posées, cherchées auprès du paquet qui déclare
    // chacune plutôt qu'à un emplacement écrit en dur : les trois vivent sous
    // `cli` aujourd'hui, et le jour où `react` en déclare une, ce cas doit
    // rendre un verdict plutôt qu'un `ENOENT`.
    for (const paquet of PAQUETS)
      for (const [nom, portée] of Object.entries(déclarées(paquet))) {
        // Même critère que `externalDeps` : nos propres paquets s'écartent par
        // leur portée, pas par leur préfixe, qu'ils garderont une fois publiés.
        if (portée.startsWith('workspace:')) continue

        // Les deux emplacements que `posée` accepte : sous le paquet, ou remonté
        // à la racine.
        const posé = [
          join(process.cwd(), 'packages', paquet, 'node_modules', nom, 'package.json'),
          join(process.cwd(), 'node_modules', nom, 'package.json'),
        ].find((un) => existsSync(un))

        expect(lu[nom], nom).toBe(JSON.parse(readFileSync(posé, 'utf8')).version)
      }
  })

  // Une dépendance déclarée et non installée rendrait la garantie d'épinglage
  // silencieusement fausse : la mesure reposerait alors sur ce que le registre
  // sert ce jour-là. Éprouvé sur une racine jetable, puisque tout est installé
  // dans celle du dépôt.
  it('lève sur une dépendance que rien n’a installée', () => {
    const racine = dossierAvec({
      'packages/faux/package.json': JSON.stringify({ dependencies: { absent: '^1.0.0' } }),
    })

    expect(() => externalDeps(['faux'], {}, racine)).toThrow('vp install')
  })
})

describe('nos propres octets', () => {
  // `vp run -r pack` a tourné avant : sinon le chiffre est celui du manifeste
  // seul, et le budget se tiendrait sur un paquet vide.
  it('comptent le dist et le manifeste de chaque paquet', () => {
    expect(ownBytes(['react'])).toBeGreaterThan(1000)
    expect(ownBytes(['react', 'core'])).toBeGreaterThan(ownBytes(['react']))
  })

  // Le message qui dit quoi faire, comme les deux autres mesures, plutôt qu'un
  // `ENOENT` brut sur un dépôt fraîchement cloné.
  it('lève en nommant la commande quand le dist manque', () => {
    expect(() => ownBytes(['demo'])).toThrow('vp run -r pack')
  })
})

const déclarées = (paquet) =>
  JSON.parse(readFileSync(join(process.cwd(), 'packages', paquet, 'package.json'), 'utf8'))
    .dependencies ?? {}

describe('la médiane', () => {
  it('prend la valeur du milieu, quel que soit l’ordre donné', () => {
    expect(médiane([700, 200, 300])).toBe(300)
    expect(médiane([300, 700, 200])).toBe(300)
  })
})

describe('le verdict', () => {
  const budgets = { startMs: 1000, adapterLines: 500 }

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
