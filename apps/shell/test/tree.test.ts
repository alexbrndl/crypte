import type { StoryEntry, StoryMeta, TokensEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { branchKeys, dimmed, fold, keysAbove, treeOf, type Node } from '../src/navigation/tree'

const entry = (
  id: string,
  name: string,
  path: string[],
  status?: StoryMeta['status'],
): StoryEntry => ({
  type: 'story',
  id,
  name,
  path,
  storyFile: `stories/${path.join('/')}.tsx`,
  component: { name: path.at(-1) ?? '', file: 'x', export: 'default' },
  options: {},
  details: {},
  props: [],
  source: '<X />',
  ...(status ? { meta: { status } } : {}),
})

// La forme seule : la nature, le nom, et les enfants.
const shape = (nodes: readonly Node[]): unknown[] =>
  nodes.map((node) =>
    'children' in node ? { [`${node.kind} ${node.name}`]: shape(node.children) } : node.name,
  )

const avecReference = entry(
  'checkout/ordersummary--with-reference',
  'With reference',
  ['checkout', 'OrderSummary'],
  'stable',
)
const sansReference = entry(
  'checkout/ordersummary--without',
  'Without',
  ['checkout', 'OrderSummary'],
  'stable',
)
const panier = entry('checkout/cart--empty', 'Empty', ['checkout', 'Cart'], 'draft')
const libelle = entry('badge--libelle-long', 'Libellé long', ['Badge'])
const active = entry('button--активная', 'Активная', ['Button'], 'deprecated')

const catalogue = [avecReference, panier, libelle, sansReference, active]

describe('the navigation tree', () => {
  test('nests folders, then the component, then its stories, in manifest order', () => {
    expect(shape(treeOf(catalogue))).toEqual([
      {
        'folder checkout': [
          { 'component OrderSummary': ['With reference', 'Without'] },
          { 'component Cart': ['Empty'] },
        ],
      },
      { 'component Badge': ['Libellé long'] },
      { 'component Button': ['Активная'] },
    ])
  })

  test('nests as deep as the path goes', () => {
    const profond = entry('a/b/c--x', 'X', ['a', 'b', 'C'])

    expect(shape(treeOf([profond]))).toEqual([
      { 'folder a': [{ 'folder b': [{ 'component C': ['X'] }] }] },
    ])
  })

  // Un dossier `Badge` et un composant `Badge` portent le même chemin.
  test('keys a folder and a component of the same path apart', () => {
    const composant = entry('badge--defaut', 'Default', ['Badge'])
    const dedans = entry('badge/icon--defaut', 'Default', ['Badge', 'Icon'])

    expect(branchKeys(treeOf([composant, dedans]))).toEqual([
      'component:badge',
      'folder:badge',
      'component:badge/icon',
    ])
  })

  test('takes the status of the component from its stories', () => {
    const [dossier] = treeOf([avecReference, panier])

    expect(
      dossier?.kind === 'folder' &&
        dossier.children.map((one) => one.kind === 'component' && one.status),
    ).toEqual(['stable', 'draft'])
  })

  // Celui de l'adresse `?component=`, le préfixe de l'id de ses stories.
  test('gives a component the id its address uses', () => {
    const [dossier] = treeOf([avecReference])
    const composant = dossier?.kind === 'folder' ? dossier.children[0] : undefined

    expect(composant?.kind === 'component' && composant.id).toBe('checkout/ordersummary')
  })

  test('names the branches above a story, from the root down', () => {
    expect(keysAbove(avecReference)).toEqual(['folder:checkout', 'component:checkout/ordersummary'])
    expect(keysAbove(libelle)).toEqual(['component:badge'])
  })
})

// Le repli avec lequel la palette compare : sans accents ni séparateurs.
describe('the folding the palette searches with', () => {
  test('drops accents, spaces and case', () => {
    expect(fold('Libellé long')).toBe(fold('libelle LONG'))
    expect(fold('OrderSummary')).toContain(fold('order summary'))
  })

  // Les signes restent hors de l'alphabet latin, comme dans un identifiant
  // (§4.3) : `й` n'est pas un `и` accentué.
  test('keeps the marks of a non latin script', () => {
    expect(fold('Активная')).toContain(fold('активн'))
    expect(fold('Всё')).not.toContain(fold('все'))
  })
})

// Le filtre grise et n'enlève rien : l'arbre garde sa forme et ses replis.
describe('the status filter', () => {
  const tree = treeOf(catalogue)

  test('greys nothing without a status', () => {
    expect([...dimmed(tree, null)]).toEqual([])
  })

  test('greys what does not carry the status, and a folder with nothing lit below', () => {
    expect([...dimmed(tree, 'draft')].sort()).toEqual(
      [
        'component:checkout/ordersummary',
        avecReference.id,
        sansReference.id,
        'component:badge',
        libelle.id,
        'component:button',
        active.id,
      ].sort(),
    )
    expect([...dimmed(tree, 'deprecated')]).toContain('folder:checkout')
  })
})

describe('a tokens family in the tree', () => {
  const famille = (id: string, name: string, path: string[]): TokensEntry => ({
    type: 'tokens',
    id,
    path,
    name,
    tokens: { primary: { type: 'color', themes: { default: { value: '#000' } } } },
  })
  const couleur = famille('tokens--color', 'color', ['Tokens'])

  test('sits under folders made of its whole path, after the stories', () => {
    expect(shape(treeOf([libelle, couleur, famille('a/b--c', 'c', ['A', 'B'])]))).toEqual([
      { 'component Badge': ['Libellé long'] },
      { 'folder Tokens': ['color'] },
      { 'folder A': [{ 'folder B': ['c'] }] },
    ])
    expect(keysAbove(couleur)).toEqual(['folder:tokens'])
  })

  // Une famille n'a pas de statut : un filtre la grise, avec son dossier.
  test('is greyed by a status filter', () => {
    expect([...dimmed(treeOf([couleur]), 'stable')].sort()).toEqual(
      ['folder:tokens', couleur.id].sort(),
    )
  })
})
