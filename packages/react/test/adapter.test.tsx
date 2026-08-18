import { useState } from 'react'
import { describe, expect, test as base } from 'vitest'
import { ADAPTER_NAME, createAdapter, type Adapter } from '../src/index'

// L'adaptateur, monté dans un DOM. Il était le seul fichier publié qu'aucun test
// n'exécutait : 0 % de couverture, et deux cas navigateur pour seule preuve, à
// travers toute la pile. Voir docs/internal/architecture.md.

const test = base.extend<{ monte: { adapter: Adapter; hote: HTMLElement } }>({
  // Le paramètre vide est la forme que vitest lit pour savoir quelles fixtures
  // initialiser. Le renommer fait collecter zéro test : mesuré.
  monte: async ({}, use) => {
    const hote = document.createElement('div')
    document.body.append(hote)
    const adapter = createAdapter()

    await use({ adapter, hote })

    adapter.unmount()
    hote.remove()
  },
})

const Badge = ({ label }: { label?: string }) => <span>{label ?? 'sans nom'}</span>

const Boum = () => {
  throw new Error('ce composant ne rend jamais')
}

// Ce qui distingue un rendu synchrone d'un rendu différé : le compteur monte à
// chaque rendu, et l'état survit à un remontage sur le même hôte.
const Compteur = () => {
  const [clics, setClics] = useState(0)

  return (
    <button type="button" onClick={() => setClics(clics + 1)}>
      {clics}
    </button>
  )
}

describe('l’adaptateur React', () => {
  test('se nomme react', () => {
    expect(ADAPTER_NAME).toBe('react')
  })

  // `flushSync` : sans lui, React commet plus tard et `mount` rendrait la main
  // avant que rien ne soit à l'écran, donc la preview annoncerait `rendered`
  // sur un cadre vide.
  test('a fini de rendre quand mount rend la main', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' })

    expect(monte.hote.textContent).toBe('Neuf')
  })

  test('passe les props telles quelles, et rien de plus', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, {})

    expect(monte.hote.textContent).toBe('sans nom')
  })

  // Le cas mesuré en navigateur : React 19 traite un composant qui lève comme
  // une erreur non rattrapée et ne la relance **pas** à l'appelant. Sans
  // `onUncaughtError` et sans la relance, `mount` rendait la main comme s'il
  // avait rendu.
  test('relance l’erreur d’un composant qui ne rend pas', ({ monte }) => {
    expect(() => monte.adapter.mount(monte.hote, Boum, {})).toThrow('ce composant ne rend jamais')
  })

  // Et l'erreur ne reste pas collée : la story suivante doit monter.
  test('remonte une story qui marche après une erreur', ({ monte }) => {
    expect(() => monte.adapter.mount(monte.hote, Boum, {})).toThrow('ne rend jamais')

    monte.adapter.mount(monte.hote, Badge, { label: 'Réparé' })

    expect(monte.hote.textContent).toBe('Réparé')
  })

  // La racine est réutilisée d'un montage à l'autre, ce qui est ce qui garde
  // l'état du composant quand on rejoue la même story.
  test('garde l’état du composant d’un montage à l’autre', async ({ monte }) => {
    monte.adapter.mount(monte.hote, Compteur, {})
    monte.hote.querySelector('button')?.click()

    // Un clic n'est pas un montage : React groupe sa mise à jour et la commet
    // plus tard, là où `mount` a fini de rendre quand il rend la main.
    await expect.poll(() => monte.hote.textContent).toBe('1')

    monte.adapter.mount(monte.hote, Compteur, {})

    expect(monte.hote.textContent).toBe('1')
  })

  test('vide l’hôte au démontage', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' })
    monte.adapter.unmount()

    expect(monte.hote.textContent).toBe('')
  })

  // Deux démontages de suite arrivent quand la preview se ferme pendant un
  // rechargement : le second ne doit pas lever.
  test('accepte un démontage sans montage, et un second démontage', ({ monte }) => {
    expect(() => monte.adapter.unmount()).not.toThrow()

    monte.adapter.mount(monte.hote, Badge, {})
    monte.adapter.unmount()

    expect(() => monte.adapter.unmount()).not.toThrow()
  })

  // Après un démontage, une nouvelle racine : l'état d'avant est perdu, ce qui
  // est ce qu'un changement de story doit faire.
  test('repart d’un état neuf après un démontage', async ({ monte }) => {
    monte.adapter.mount(monte.hote, Compteur, {})
    monte.hote.querySelector('button')?.click()
    await expect.poll(() => monte.hote.textContent).toBe('1')
    monte.adapter.unmount()

    monte.adapter.mount(monte.hote, Compteur, {})

    expect(monte.hote.textContent).toBe('0')
  })
})
