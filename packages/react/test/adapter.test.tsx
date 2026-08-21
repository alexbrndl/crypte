import { useState } from 'react'
import { describe, expect, test as base } from 'vitest'
import react, { ADAPTER_NAME, createAdapter, type Adapter } from '../src/index'

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

  // La forme que le contrat montre en section 1.5, `adapter: react()`, et qui
  // manquait : le guide et la démonstration écrivaient `createAdapter()`.
  test('rend le même adaptateur par son export par défaut', ({ monte }) => {
    const court = react()

    court.mount(monte.hote, Badge, { label: 'Neuf' })

    expect(monte.hote.textContent).toBe('Neuf')
    court.unmount()
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

// Les enveloppes, la promesse de la section 2.5 : le `wrap` global enveloppe
// celui du fichier, qui enveloppe le composant. Avant ce lot, `wrap` était lu,
// typé, validé, puis jeté : une story qui déclarait un provider rendait sans lui.
describe('les enveloppes', () => {
  const Cadre =
    (nom: string) =>
    ({ children, ton }: { children?: unknown; ton?: string }) => (
      <div data-cadre={nom} data-ton={ton}>
        {children as never}
      </div>
    )

  const Theme = Cadre('theme')
  const Router = Cadre('router')

  test('monte le composant à l’intérieur de son enveloppe', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' }, [{ component: Theme, props: {} }])

    const cadre = monte.hote.querySelector('[data-cadre="theme"]')

    expect(cadre).not.toBeNull()
    expect(cadre?.textContent).toBe('Neuf')
  })

  // L'ordre est toute la règle : la première entrée est la plus extérieure.
  test('met la première enveloppe à l’extérieur', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' }, [
      { component: Router, props: {} },
      { component: Theme, props: {} },
    ])

    expect(monte.hote.querySelector('[data-cadre="router"] > [data-cadre="theme"]')).not.toBeNull()
    expect(monte.hote.querySelector('[data-cadre="theme"] > [data-cadre="router"]')).toBeNull()
  })

  test('passe à une enveloppe les props qu’elle déclare', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, {}, [{ component: Theme, props: { ton: 'sombre' } }])

    expect(monte.hote.querySelector('[data-cadre="theme"]')?.getAttribute('data-ton')).toBe(
      'sombre',
    )
  })

  // Sans enveloppe, rien ne change : c'est le cas courant, et un cadre en trop
  // casserait la mise en page de toutes les stories existantes.
  test('ne pose aucun cadre quand la liste est vide', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' }, [])

    expect(monte.hote.querySelector('div')).toBeNull()
    expect(monte.hote.textContent).toBe('Neuf')
  })

  test('accepte l’absence du quatrième argument', ({ monte }) => {
    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' })

    expect(monte.hote.textContent).toBe('Neuf')
  })

  // La règle de la section 2.5, que le typage ne peut pas imposer : en React un
  // composant **est** une fonction, donc `wrap: (story) => …` et
  // `wrap: Provider` ont le même type. Toute fonction est instanciée, donc elle
  // reçoit des props et non l'élément rendu. Qui attend l'élément obtient un
  // rendu faux, pas une ambiguïté.
  test('instancie une fonction reçue par wrap, au lieu de l’appeler', ({ monte }) => {
    const reçu: unknown[] = []
    const Fonction = (props: { children?: unknown }) => {
      reçu.push(props)

      return props.children as never
    }

    monte.adapter.mount(monte.hote, Badge, { label: 'Neuf' }, [
      { component: Fonction, props: { ton: 'clair' } },
    ])

    expect(reçu).toHaveLength(1)
    // Des props, avec les enfants dedans : c'est la forme d'un composant
    // instancié. Appelée, la fonction aurait reçu l'élément lui-même.
    expect(reçu[0]).toMatchObject({ ton: 'clair' })
    expect(reçu[0]).toHaveProperty('children')
    expect(monte.hote.textContent).toBe('Neuf')
  })

  // Une enveloppe qui lève doit remonter comme une story qui lève : sinon le
  // cadre reste vide et la preview annonce « rendered ».
  test('relance l’erreur d’une enveloppe qui ne rend pas', ({ monte }) => {
    const Casse = () => {
      throw new Error('cette enveloppe ne rend jamais')
    }

    expect(() =>
      monte.adapter.mount(monte.hote, Badge, {}, [{ component: Casse, props: {} }]),
    ).toThrow('cette enveloppe ne rend jamais')
  })
})
