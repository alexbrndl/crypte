import type { StoryEntry, StoryMeta, TokensEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import { branchKeys, filtered, keysAbove, treeOf, type Node } from '../src/tree'

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

describe('the search', () => {
  const tree = treeOf(catalogue)

  test('keeps everything when it is empty', () => {
    expect(filtered(tree, '', [])).toEqual(tree)
  })

  test('finds a story by its name, accents and spaces aside', () => {
    expect(shape(filtered(tree, 'libelle long', []))).toEqual([
      { 'component Badge': ['Libellé long'] },
    ])
  })

  test('keeps every story of a component it finds by name', () => {
    expect(shape(filtered(tree, 'order summary', []))).toEqual([
      { 'folder checkout': [{ 'component OrderSummary': ['With reference', 'Without'] }] },
    ])
  })

  test('keeps everything under a folder it finds by name', () => {
    expect(shape(filtered(tree, 'CHECKOUT', []))).toEqual([
      {
        'folder checkout': [
          { 'component OrderSummary': ['With reference', 'Without'] },
          { 'component Cart': ['Empty'] },
        ],
      },
    ])
  })

  // Les signes restent hors de l'alphabet latin, comme dans un identifiant
  // (§4.3) : `й` n'est pas un `и` accentué.
  test('keeps the marks of a non latin script', () => {
    expect(shape(filtered(tree, 'активн', []))).toEqual([{ 'component Button': ['Активная'] }])
    expect(filtered(treeOf([entry('x--vse', 'Всё', ['X'])]), 'все', [])).toEqual([])
  })

  test('keeps nothing when nothing matches', () => {
    expect(filtered(tree, 'nowhere', [])).toEqual([])
  })
})

describe('the status filter', () => {
  const tree = treeOf(catalogue)

  test('keeps the components of the chosen statuses, and none without one', () => {
    expect(shape(filtered(tree, '', ['draft', 'deprecated']))).toEqual([
      { 'folder checkout': [{ 'component Cart': ['Empty'] }] },
      { 'component Button': ['Активная'] },
    ])
  })

  test('applies with the search', () => {
    expect(shape(filtered(tree, 'checkout', ['stable']))).toEqual([
      { 'folder checkout': [{ 'component OrderSummary': ['With reference', 'Without'] }] },
    ])
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

  test('is found by its name or its folder, and hidden by a status filter', () => {
    const tree = treeOf([libelle, couleur])

    expect(shape(filtered(tree, 'colo', []))).toEqual([{ 'folder Tokens': ['color'] }])
    expect(shape(filtered(tree, 'tokens', []))).toEqual([{ 'folder Tokens': ['color'] }])
    expect(filtered(treeOf([couleur]), '', ['stable'])).toEqual([])
  })
})
