import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  audit,
  cleanOf,
  drawnOf,
  unjudgedOf,
  failuresOf,
  findingsOf,
  type AuditResult,
} from '../src/health/audit'

// L'audit d'accessibilité : ce qu'il retient de chaque rendu, et ce qu'il fait
// d'une story qui échoue ou d'un plugin muet.

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

function cadre() {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const dit = (data: unknown) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: frame.contentWindow,
      }),
    )
  return { frame, dit }
}

describe('the audit', () => {
  // Une story qui lève est notée, l'audit continue ; une story dont le plugin ne
  // répond pas aussi, au bout de l'attente.
  test('notes a story that fails or that the plugin leaves unanswered, and goes on', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      if (id === 'a--b') setTimeout(() => dit({ type: 'error', id, message: 'boum' }))
      if (id === 'c--d')
        setTimeout(() => dit({ type: 'a11y:results', id: 'autre--x', passes: 0, violations: [] }))
    })
    const fini = audit(frame, ['a--b', 'c--d'], {
      reload: () => setTimeout(() => dit({ type: 'ready', protocolVersion: 1 })),
    })
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(await fini).toEqual([
      { id: 'a--b', theme: 'light', broken: 'boum' },
      { id: 'a--b', theme: 'dark', broken: 'boum' },
      { id: 'c--d', theme: 'light', silent: true },
      { id: 'c--d', theme: 'dark', silent: true },
    ])
  })

  // Une réponse arrivée après l'attente passerait pour celle du rendu suivant :
  // la preview est rechargée, ce qu'elle avait en cours part avec sa page, et
  // l'audit reprend une fois qu'elle a redit `ready`. Ici la page d'avant répond
  // trop tard, et la nouvelle à temps.
  test('reloads the preview after a render left unanswered, and goes on', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    const x = { rule: 'x', impact: 'minor', help: 'X', helpUrl: '', targets: [] }
    let page = 0
    const recharge = vi.fn(() => {
      page += 1
      setTimeout(() => dit({ type: 'ready', protocolVersion: 1 }), 100)
    })
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id, theme } = event.data as { id: string; theme: string }
      const mienne = page
      if (page === 0 && theme === 'light') {
        // La page d'avant : sa réponse tardive n'arrive jamais, elle est partie.
        setTimeout(
          () => mienne === page && dit({ type: 'a11y:results', id, passes: 1, violations: [] }),
          8050,
        )
        return
      }
      setTimeout(() =>
        dit({ type: 'a11y:results', id, passes: 1, violations: theme === 'dark' ? [x] : [] }),
      )
    })
    const fini = audit(frame, ['a--b', 'c--d'], { reload: recharge })
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(recharge).toHaveBeenCalledOnce()
    expect(
      (await fini).map(
        (one) =>
          `${one.id} ${one.theme} ${'violations' in one ? one.violations.length : 'silent' in one ? 'silent' : '?'}`,
      ),
    ).toEqual(['a--b light silent', 'a--b dark 1', 'c--d light 0', 'c--d dark 1'])
  })

  test('gives up when the reloaded preview never says ready', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    const fini = audit(frame, ['a--b'], { reload: () => {} })
    const refus = expect(fini).rejects.toThrow('the preview never came back after a reload')
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()
    await refus
  })

  // Sans retard en cours, l'échec du hook est l'erreur de la story demandée.
  test('notes the a11y hook failing as the error of the story asked', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    frame.contentWindow!.addEventListener('message', () => {
      setTimeout(() => dit({ type: 'plugin-error', plugin: 'a11y', message: 'axe threw' }))
    })
    const fini = audit(frame, ['a--b'])
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect((await fini).map((one) => ('error' in one ? one.error : 'read'))).toEqual([
      'axe threw',
      'axe threw',
    ])
  })

  // Une forme que le shell ne lit pas est nommée, story par story.
  test('names an answer in a shape it does not read', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      setTimeout(() =>
        dit({ type: 'a11y:results', id, passes: 1, violations: [{ name: 'x', level: 'minor' }] }),
      )
    })
    const fini = audit(frame, ['a--b'])
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect((await fini).map((one) => ('error' in one ? one.error : 'read'))).toEqual([
      'the a11y plugin answered in a shape the shell does not read',
      'the a11y plugin answered in a shape the shell does not read',
    ])
  })

  // Les couleurs mesurées d'un défaut de contraste se lisent ; une couleur qui
  // n'est pas une chaîne rend la réponse illisible, comme un autre champ.
  test('reads the measured colours, and refuses a colour that is not a string', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    const contraste = (colors: unknown[]) => ({
      rule: 'color-contrast',
      impact: 'serious',
      help: 'C',
      helpUrl: '',
      targets: ['.a'],
      colors,
    })
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id, theme } = event.data as { id: string; theme: string }
      setTimeout(() =>
        dit({
          type: 'a11y:results',
          id,
          passes: 1,
          violations: [contraste(theme === 'light' ? ['#777777', '#ffffff'] : [7])],
        }),
      )
    })
    const fini = audit(frame, ['a--b'])
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(
      (await fini).map((one) =>
        'violations' in one ? one.violations[0]?.colors : 'error' in one ? one.error : '?',
      ),
    ).toEqual([
      ['#777777', '#ffffff'],
      'the a11y plugin answered in a shape the shell does not read',
    ])
  })

  // Sans le plugin a11y, l'audit attend le rendu seul : une story rendue est notée
  // comme telle, une story qui lève garde sa pile.
  test('waits for the render alone without the a11y plugin', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      setTimeout(() =>
        dit(
          id === 'a--b'
            ? { type: 'rendered', id, durationMs: 1, values: {} }
            : { type: 'error', id, message: 'boum', stack: 'Error: boum\n    at Boom' },
        ),
      )
    })
    const fini = audit(frame, ['a--b', 'c--d'], { a11y: false })
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(await fini).toEqual([
      { id: 'a--b', theme: 'light', drawn: true },
      { id: 'a--b', theme: 'dark', drawn: true },
      { id: 'c--d', theme: 'light', broken: 'boum', stack: 'Error: boum\n    at Boom' },
      { id: 'c--d', theme: 'dark', broken: 'boum', stack: 'Error: boum\n    at Boom' },
    ])
  })

  // Le shell démonté : l'audit s'arrête là, sans lever ni attendre.
  test('stops when told to, with what it has rendered', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    const arrêt = new AbortController()
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      setTimeout(() => dit({ type: 'rendered', id, durationMs: 1, values: {} }))
    })
    const fini = audit(frame, ['a--b', 'c--d'], {
      a11y: false,
      signal: arrêt.signal,
      progress: (done) => done === 2 && arrêt.abort(),
    })
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect((await fini).map((one) => `${one.id} ${one.theme}`)).toEqual(['a--b light', 'a--b dark'])
  })

  test('gives up when the preview never says ready', async () => {
    vi.useFakeTimers()
    const { frame } = cadre()
    const fini = audit(frame, ['a--b'])
    const refus = expect(fini).rejects.toThrow('the preview never said it was ready')
    await vi.runAllTimersAsync()
    await refus
  })
})

describe('what the audit says', () => {
  const résultats: AuditResult[] = [
    { id: 'a--b', theme: 'light', passes: 2, violations: [] },
    { id: 'a--b', theme: 'dark', passes: 2, violations: [] },
    {
      id: 'c--d',
      theme: 'light',
      passes: 1,
      violations: [{ rule: 'x', impact: 'minor', help: 'X', helpUrl: '', targets: [] }],
    },
    { id: 'c--d', theme: 'dark', passes: 1, violations: [] },
    { id: 'e--f', theme: 'light', silent: true },
    { id: 'e--f', theme: 'dark', silent: true },
    { id: 'g--h', theme: 'light', broken: 'boum' },
    { id: 'g--h', theme: 'dark', drawn: true },
    { id: 'i--j', theme: 'light', error: 'axe threw' },
    { id: 'i--j', theme: 'dark', passes: 1, violations: [] },
  ]

  // Seul ce qu'axe a jugé compte : une story muette, qui lève, ou dont l'analyse a
  // échoué n'entre pas dans la jauge a11y, et la page la nomme à part.
  test('counts as clean only what axe judged without violation', () => {
    expect(cleanOf(résultats)).toEqual({ clean: 2, audited: 3 })
    expect(unjudgedOf(résultats)).toEqual(['e--f', 'i--j'])
  })

  // Une story qui lève dans un thème au moins ne rend pas, et c'est ce que liste sa
  // page ; une story muette n'entre pas dans le compte ; une analyse échouée a rendu.
  test('counts as drawn every story but those the failures page lists', () => {
    expect(drawnOf(résultats)).toEqual({ drawn: 3, audited: 4 })
    expect(failuresOf(résultats).map((one) => [one.id, one.themes])).toEqual([['g--h', ['light']]])
  })

  test('lists one finding per story and rule, with its themes', () => {
    expect(findingsOf(résultats).map((one) => [one.key, one.themes])).toEqual([
      ['c--d:x', ['light']],
    ])
  })
})
