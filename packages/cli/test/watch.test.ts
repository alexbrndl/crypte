import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { componentWatchers, debounced, type Watch } from '../src/watch'

// Ce que le vrai système de fichiers ne sait pas éprouver sur macOS : un
// surveillant voisin y capte l'écriture d'un surveillant mort, aucune API
// n'expose la fenêtre de 20 ms qu'un arrêt doit fermer, et l'écho d'une création
// arrive quand il veut. Un faux `watch` et de faux minuteurs rendent les trois
// déterministes.

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

describe('the debounce', () => {
  it('runs only once, after the last call', () => {
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
  it('runs nothing armed before the stop, nor after', () => {
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

describe('component watchers', () => {
  // Une sauvegarde atomique remplace l'inode : le surveillant d'avant devient
  // muet, et seule une réouverture sur le même chemin entend la suivante.
  it('reopens the watcher of a file renamed over', () => {
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

  it('opens nothing once stopped, not even on a late rename', () => {
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

  it('keeps what is still wanted and closes the rest', () => {
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

  // L'écho de la création d'une copie, que macOS livre après l'ouverture du
  // surveillant : 35 échos pour 48 démarrages mesurés, et chacun reconstruisait le
  // catalogue sous le cas qui venait d'y injecter une entrée. DCJ-325.
  describe('on a change', () => {
    let dossier: string
    let fichier: string

    beforeEach(() => {
      dossier = mkdtempSync(join(tmpdir(), 'crypte-watch-'))
      fichier = join(dossier, 'Badge.jsx')
      writeFileSync(fichier, 'a')
    })

    afterEach(() => {
      rmSync(dossier, { recursive: true, force: true })
    })

    const surveille = () => {
      const faux = fauxWatch()
      const changed = vi.fn()
      componentWatchers(changed, () => {}, faux.watch).sync([fichier])
      const dernier = () => faux.vivants(fichier)[0]!
      return { changed, dernier }
    }

    it('rebuilds nothing while the content stays as read', () => {
      const { changed, dernier } = surveille()

      dernier().listener('change')
      writeFileSync(fichier, 'b')
      dernier().listener('change')
      dernier().listener('change')

      expect(changed).toHaveBeenCalledTimes(1)
    })

    // Même taille, à dessein : ce que `mtime` à la seconde ne distinguerait pas.
    it('rebuilds on each content, back to an earlier one included', () => {
      const { changed, dernier } = surveille()

      for (const contenu of ['b', 'a', 'b']) {
        writeFileSync(fichier, contenu)
        dernier().listener('change')
      }

      expect(changed).toHaveBeenCalledTimes(3)
    })

    // Une sauvegarde atomique reconstruit toujours, et le surveillant rouvert
    // compare à ce qu'elle a écrit : son écho ne reconstruit pas une deuxième fois.
    it('compares with what a save renamed over wrote', () => {
      const { changed, dernier } = surveille()

      writeFileSync(fichier, 'b')
      dernier().listener('rename')
      dernier().listener('change')

      expect(changed).toHaveBeenCalledTimes(1)
    })

    it('rebuilds on every change of a file it cannot read', () => {
      const { changed, dernier } = surveille()

      rmSync(fichier)
      dernier().listener('change')
      dernier().listener('change')

      expect(changed).toHaveBeenCalledTimes(2)
    })
  })

  it('reports which file could not be watched, and goes on', () => {
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
