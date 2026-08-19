import { describe, expect, it } from 'vitest'
import { wrapsOf } from '../src/preview'

// L'ordre des enveloppes, et rien d'autre : composer les composants appartient à
// l'adaptateur, mettre cette forme à plat n'appartient à aucun framework.
// Section 2.5 de docs/contracts.md.

const Theme = 'Theme'
const Router = 'Router'
const Global = 'Global'

describe('les enveloppes d’une story', () => {
  it('rend une liste vide quand personne n’en déclare', () => {
    expect(wrapsOf(undefined, undefined)).toEqual([])
    expect(wrapsOf(undefined, {})).toEqual([])
  })

  it('accepte une enveloppe seule, sans tableau', () => {
    expect(wrapsOf(undefined, { wrap: Theme })).toEqual([{ component: Theme, props: {} }])
  })

  // La première entrée est la plus extérieure : c'est la règle du contrat, et
  // l'inverser rendrait un Router à l'intérieur de son thème.
  it('garde l’ordre du tableau, extérieure en premier', () => {
    expect(wrapsOf(undefined, { wrap: [Router, Theme] })).toEqual([
      { component: Router, props: {} },
      { component: Theme, props: {} },
    ])
  })

  it('lit les props d’une entrée en paire', () => {
    expect(wrapsOf(undefined, { wrap: [[Theme, { mode: 'dark' }]] })).toEqual([
      { component: Theme, props: { mode: 'dark' } },
    ])
  })

  it('mélange les deux formes dans un même tableau', () => {
    expect(wrapsOf(undefined, { wrap: [Router, [Theme, { mode: 'dark' }]] })).toEqual([
      { component: Router, props: {} },
      { component: Theme, props: { mode: 'dark' } },
    ])
  })

  // Le cœur du contrat : le `wrap` global enveloppe celui du fichier, qui
  // enveloppe le composant. Donc le global vient en premier.
  it('met le wrap global à l’extérieur de celui du fichier', () => {
    expect(wrapsOf(Global, { wrap: Theme })).toEqual([
      { component: Global, props: {} },
      { component: Theme, props: {} },
    ])
  })

  it('accepte un wrap global seul, sans wrap de fichier', () => {
    expect(wrapsOf([Global, Router], undefined)).toEqual([
      { component: Global, props: {} },
      { component: Router, props: {} },
    ])
  })

  // Les formes dégénérées : `null` là où un composant est attendu ne doit pas
  // faire monter une enveloppe vide, qui rendrait la story invisible.
  it('écarte une entrée sans composant', () => {
    expect(wrapsOf(null, { wrap: [null, Theme] })).toEqual([{ component: Theme, props: {} }])
    expect(wrapsOf(undefined, { wrap: [[null, { mode: 'dark' }]] })).toEqual([])
  })

  it('traite une paire sans props comme une enveloppe nue', () => {
    expect(wrapsOf(undefined, { wrap: [[Theme]] })).toEqual([{ component: Theme, props: {} }])
  })
})
