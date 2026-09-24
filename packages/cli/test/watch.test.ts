import { afterEach, describe, expect, it, vi } from 'vitest'
import { componentWatchers, debounced, type Watch } from '../src/watch'

// Les deux garanties du suivi que le vrai système de fichiers ne sait pas
// éprouver sur macOS : un surveillant voisin y capte l'écriture d'un surveillant
// mort, et aucune API n'expose la fenêtre de 20 ms qu'un arrêt doit fermer. Un
// faux `watch` et de faux minuteurs rendent les deux déterministes.

afterEach(() => {
  vi.useRealTimers()
})

// Un `watch` qui garde chaque surveillant ouvert, pour déclencher ses
// événements à la main et voir ce qui est fermé.
function fauxWatch() {
  const ouverts: { file: string; listener: (type: string) => void; fermé: boolean }[] = []
  const watch: Watch = (file, listener) => {
    const one = { file, listener, fermé: false }
    ouverts.push(one)
    return { close: () => (one.fermé = true) }
  }
  const vivants = (file: string) => ouverts.filter((one) => one.file === file && !one.fermé)

  return { watch, ouverts, vivants }
}

describe('la temporisation', () => {
  it('ne lance qu’une fois, après le dernier appel', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const { soon } = debounced(run, 20)

    soon()
    vi.advanceTimersByTime(10)
    soon()
    vi.advanceTimersByTime(19)
    expect(run).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  // La fenêtre que le vrai système de fichiers n'expose pas : armée juste avant
  // l'arrêt, elle reconstruisait après lui.
  it('ne lance rien d’armé avant l’arrêt, ni après', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const { soon, stop } = debounced(run, 20)

    soon()
    stop()
    soon()
    vi.advanceTimersByTime(100)

    expect(run).not.toHaveBeenCalled()
  })
})

describe('les surveillants de composant', () => {
  // Une sauvegarde atomique remplace l'inode : le surveillant d'avant devient
  // muet, et seule une réouverture sur le même chemin entend la suivante.
  it('rouvre le surveillant d’un fichier renommé par-dessus', () => {
    const faux = fauxWatch()
    const changed = vi.fn()
    const surveillants = componentWatchers(changed, () => {}, faux.watch)

    surveillants.sync(['Badge.jsx'])
    const premier = faux.vivants('Badge.jsx')[0]!
    premier.listener('rename')

    expect(premier.fermé).toBe(true)
    expect(faux.vivants('Badge.jsx')).toHaveLength(1)
    expect(faux.vivants('Badge.jsx')[0]).not.toBe(premier)
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('n’ouvre plus rien une fois arrêté, pas même sur un renommage tardif', () => {
    const faux = fauxWatch()
    const surveillants = componentWatchers(
      () => {},
      () => {},
      faux.watch,
    )

    surveillants.sync(['Badge.jsx', 'Card.jsx'])
    const tardif = faux.vivants('Badge.jsx')[0]!
    surveillants.stop()
    tardif.listener('rename')
    surveillants.sync(['Badge.jsx'])

    expect(faux.ouverts.filter((one) => !one.fermé)).toEqual([])
    expect(surveillants.watched()).toEqual([])
  })

  it('garde ce qui reste voulu et ferme le reste', () => {
    const faux = fauxWatch()
    const surveillants = componentWatchers(
      () => {},
      () => {},
      faux.watch,
    )

    surveillants.sync(['Badge.jsx', 'Card.jsx'])
    const gardé = faux.vivants('Badge.jsx')[0]
    surveillants.sync(['Badge.jsx', 'Tag.jsx'])

    expect(faux.vivants('Badge.jsx')[0]).toBe(gardé)
    expect(faux.vivants('Card.jsx')).toEqual([])
    expect(surveillants.watched()).toEqual(['Badge.jsx', 'Tag.jsx'])
  })

  it('dit quel fichier n’a pas pu être surveillé, et continue', () => {
    const failed = vi.fn()
    const surveillants = componentWatchers(
      () => {},
      failed,
      (file) => {
        if (file === 'Absent.jsx') throw new Error('ENOENT')
        return { close: () => {} }
      },
    )

    surveillants.sync(['Absent.jsx', 'Badge.jsx'])

    expect(failed).toHaveBeenCalledWith('Absent.jsx', new Error('ENOENT'))
    expect(surveillants.watched()).toEqual(['Badge.jsx'])
  })
})
