import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BUDGETS,
  MESURES,
  PAQUETS,
  adapterLines,
  catalogOf,
  externalDeps,
  médiane,
  ownBytes,
  ADRESSE,
  sansCouleur,
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

  it('écarte nos propres paquets et lit les trois que le CLI déclare', () => {
    expect(
      Object.keys(externalDeps(PAQUETS, catalogue)).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['sirv', 'tsconfck', 'vite'])
  })

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
      for (const nom of Object.keys(déclarées(paquet))) {
        if (nom.startsWith('@crypte/')) continue

        const posé = join(process.cwd(), 'packages', paquet, 'node_modules', nom, 'package.json')

        expect(existsSync(posé), `${paquet} n'a pas installé ${nom}`).toBe(true)
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

  // pnpm remonte certains modules à la racine plutôt que sous le paquet qui
  // les déclare. Aucune des trois dépendances du dépôt n'est dans ce cas
  // aujourd'hui, donc rien d'autre n'emprunte ce repli : la mutation qui le
  // retire ne faisait rougir personne avant ce cas.
  it('épingle aussi ce qui est remonté à la racine', () => {
    const racine = dossierAvec({
      'packages/faux/package.json': JSON.stringify({ dependencies: { remonté: '^2.0.0' } }),
      'node_modules/remonté/package.json': JSON.stringify({ version: '2.7.0' }),
    })

    expect(externalDeps(['faux'], {}, racine)).toEqual({ remonté: '2.7.0' })
  })

  // Le paquet d'abord, la racine ensuite : deux versions installées, celle du
  // paquet est celle qu'il chargera.
  it('préfère la version posée sous le paquet', () => {
    const racine = dossierAvec({
      'packages/faux/package.json': JSON.stringify({ dependencies: { deux: '^1.0.0' } }),
      'packages/faux/node_modules/deux/package.json': JSON.stringify({ version: '1.0.0' }),
      'node_modules/deux/package.json': JSON.stringify({ version: '9.9.9' }),
    })

    expect(externalDeps(['faux'], {}, racine)).toEqual({ deux: '1.0.0' })
  })

  it('épingle sur cette racine-là quand on lui en donne une', () => {
    const racine = dossierAvec({
      'packages/faux/package.json': JSON.stringify({ dependencies: { posé: '^1.0.0' } }),
      'packages/faux/node_modules/posé/package.json': JSON.stringify({ version: '1.4.2' }),
    })

    expect(externalDeps(['faux'], {}, racine)).toEqual({ posé: '1.4.2' })
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

  // Le message qui dit quoi faire, comme les deux autres mesures, plutôt qu'un
  // `ENOENT` brut sur un dépôt fraîchement cloné.
  it('lève en nommant la commande quand le dist manque', () => {
    expect(() => ownBytes(['demo'])).toThrow('vp run -r pack')
  })
})

// Les deux mesures qui comptent nos paquets lisent la même liste. Compter le
// poids de `core` sans lire ses dépendances laisserait, le jour où il en
// déclare une, un budget vert sur un chiffre faux.
//
// **Aucun cas ne peut aujourd'hui tenir cette coïncidence.** `core` ne déclare
// aucune dépendance externe, donc lire deux paquets ou trois donne le même
// résultat, et la mutation qui remet `['cli', 'react']` au point d'appel ne
// fait rougir personne — mesuré. Ce qui suit encode l'invariant pour qu'il
// morde le jour où `core` en déclare une, et le dit plutôt que de le masquer.
describe('la liste des paquets', () => {
  it('est celle que les deux mesures emploient', () => {
    expect(PAQUETS).toEqual(['cli', 'react', 'core'])
    expect(ownBytes()).toBe(ownBytes(PAQUETS))
  })

  it('couvre ce que chacun de ses paquets déclare', () => {
    const lu = externalDeps(PAQUETS, catalogueDuDépôt)

    for (const paquet of PAQUETS)
      for (const [nom, portée] of Object.entries(déclarées(paquet)))
        if (!portée.startsWith('workspace:')) expect(lu, `${paquet} → ${nom}`).toHaveProperty(nom)
  })
})

const déclarées = (paquet) =>
  JSON.parse(readFileSync(join(process.cwd(), 'packages', paquet, 'package.json'), 'utf8'))
    .dependencies ?? {}

const catalogueDuDépôt = catalogOf(readFileSync(join(process.cwd(), 'pnpm-workspace.yaml'), 'utf8'))

// La ligne que Vite écrit sur un runner, colorisée, telle que le journal du
// job l'a rendue. Le port y suit un code de mise en gras, donc `\\d` ne le
// trouve pas : le job attendait soixante secondes une adresse arrivée en
// 392 ms, et rien ne le montrait en local, où il n'y a pas de couleur.
describe('l’adresse annoncée par le serveur', () => {
  const esc = String.fromCharCode(27)
  const colorée = `  ${esc}[32m➜${esc}[39m  ${esc}[1mLocal${esc}[22m:   ${esc}[36mhttp://localhost:${esc}[1m5173${esc}[22m/${esc}[39m`
  const nue = '  ➜  Local:   http://localhost:5173/'

  it('ne se lit pas sous les couleurs', () => {
    expect(ADRESSE.exec(colorée)).toBeNull()
  })

  it('se lit une fois les couleurs retirées', () => {
    expect(ADRESSE.exec(sansCouleur(colorée))?.[1]).toBe('http://localhost:5173')
  })

  it('se lit aussi sans couleur du tout', () => {
    expect(ADRESSE.exec(sansCouleur(nue))?.[1]).toBe('http://localhost:5173')
  })

  it('laisse le texte intact quand il n’y a rien à retirer', () => {
    expect(sansCouleur(nue)).toBe(nue)
  })

  // L'hôte que Vite écrit dépend du réglage `host`, et les trois formes se
  // valent pour ce que la mesure attend : que le serveur réponde quelque part.
  it.for(['localhost', '127.0.0.1', '[::1]'])('reconnaît %s', (hôte) => {
    expect(ADRESSE.exec(`➜ Local: http://${hôte}:4321/`)?.[1]).toBe(`http://${hôte}:4321`)
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

  it('commence par son titre', () => {
    expect(table(rendus).split('\n')[0]).toBe('## Budgets')
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
