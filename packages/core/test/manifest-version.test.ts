import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MANIFEST_VERSION } from '../src/protocol/manifest'
import { manifestShape } from './manifest-shape'

// La règle de version du manifeste, section 4.2 : une forme publiée ne change pas
// sous le même numéro. Le fichier de la version courante est sa ligne de base ;
// toute différence rougit, et le message dit quoi faire selon que la version a
// déjà été publiée ou non.

const here = dirname(fileURLToPath(import.meta.url))
const baseline = join(here, `manifest-shape.v${MANIFEST_VERSION}.json`)
const published =
  (JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string })
    .version !== '0.0.0'

describe('the manifest version', () => {
  it('reads the shape of every type a manifest holds', () => {
    const shape = manifestShape()

    expect(Object.keys(shape).length).toBeGreaterThan(10)
    expect(Object.values(shape).every((one) => Object.keys(one).length > 0)).toBe(true)
    expect(existsSync(baseline), `manifest-shape.v${MANIFEST_VERSION}.json is missing`).toBe(true)
  })

  // Un type que la forme cite sans le relever pourrait changer sans que rien ne
  // rougisse : chaque nom de type cité en est une clé, hors les génériques natifs
  // et `PluginPropDetails`, vide dans le noyau, que chaque plugin augmente.
  it('reads every type its fields name', () => {
    const shape = manifestShape()
    const cited = Object.values(shape)
      .flatMap((one) => (typeof one === 'string' ? [one] : Object.values(one)))
      .flatMap((text) => text.match(/\b[A-Z]\w*/g) ?? [])
      .filter((name) => name !== 'Record' && name !== 'PluginPropDetails')

    expect(cited.length).toBeGreaterThan(5)
    expect(cited.filter((name) => !(name in shape))).toEqual([])
  })

  it('keeps the shape its version recorded', () => {
    expect(
      manifestShape(),
      published
        ? `The manifest's shape moved under MANIFEST_VERSION ${MANIFEST_VERSION}, which is published. ` +
            `Bump it and record the new shape in manifest-shape.v${MANIFEST_VERSION + 1}.json; ` +
            `an optional field or a new nature of entry added, and nothing else, may be recorded in the current file instead.`
        : `The manifest's shape moved. Nothing is published yet, so record it in manifest-shape.v${MANIFEST_VERSION}.json.`,
    ).toEqual(JSON.parse(readFileSync(baseline, 'utf8')))
  })
})
