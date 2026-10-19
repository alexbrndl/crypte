import { afterEach, describe, expect, test, vi } from 'vitest'
import { audit, cleanOf, findingsOf, type AuditResult } from '../src/health/audit'

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
    const fini = audit(frame, ['a--b', 'c--d'], () => {})
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(await fini).toEqual([
      { id: 'a--b', theme: 'light', error: 'boum' },
      { id: 'a--b', theme: 'dark', error: 'boum' },
      { id: 'c--d', theme: 'light', error: 'no answer from the a11y plugin' },
      { id: 'c--d', theme: 'dark', error: 'no answer from the a11y plugin' },
    ])
  })

  // L'analyse light arrive après l'attente, avant celle du dark : écartée, elle ne
  // passe pas pour la mesure dark.
  test('drops an analysis that comes back after the wait, rather than take it for the next', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    const x = { rule: 'x', impact: 'minor', help: 'X', helpUrl: '', targets: [] }
    let rendus = 0
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      rendus += 1
      if (rendus === 1)
        setTimeout(() => dit({ type: 'a11y:results', id, passes: 1, violations: [] }), 8050)
      else setTimeout(() => dit({ type: 'a11y:results', id, passes: 1, violations: [x] }), 500)
    })
    const fini = audit(frame, ['a--b'], () => {})
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(await fini).toEqual([
      { id: 'a--b', theme: 'light', error: 'no answer from the a11y plugin' },
      { id: 'a--b', theme: 'dark', passes: 1, violations: [x] },
    ])
  })

  // L'analyse light dépasse l'attente puis échoue : son échec la solde, et la
  // mesure dark qui suit est gardée.
  test('counts a late analysis that fails as answered, and keeps the next one', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    let rendus = 0
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      rendus += 1
      if (rendus === 1)
        setTimeout(() => dit({ type: 'plugin-error', plugin: 'a11y', message: 'axe threw' }), 8050)
      else setTimeout(() => dit({ type: 'a11y:results', id, passes: 1, violations: [] }), 500)
    })
    const fini = audit(frame, ['a--b'], () => {})
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(await fini).toEqual([
      { id: 'a--b', theme: 'light', error: 'no answer from the a11y plugin' },
      { id: 'a--b', theme: 'dark', passes: 1, violations: [] },
    ])
  })

  // L'analyse dark de la première story échoue en retard, pendant que la seconde
  // est mesurée : l'échec sans id ne passe pas pour celui de la seconde.
  test('keeps a late failure of one story from landing on the next', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    let rendus = 0
    frame.contentWindow!.addEventListener('message', (event) => {
      const { id } = event.data as { id: string }
      rendus += 1
      if (rendus === 2)
        setTimeout(() => dit({ type: 'plugin-error', plugin: 'a11y', message: 'axe threw' }), 8050)
      else if (rendus === 3)
        setTimeout(() => dit({ type: 'a11y:results', id, passes: 1, violations: [] }), 500)
      else setTimeout(() => dit({ type: 'a11y:results', id, passes: 1, violations: [] }))
    })
    const fini = audit(frame, ['a--b', 'c--d'], () => {})
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect(
      (await fini).map((one) => `${one.id} ${one.theme} ${'error' in one ? one.error : 'read'}`),
    ).toEqual([
      'a--b light read',
      'a--b dark no answer from the a11y plugin',
      'c--d light read',
      'c--d dark read',
    ])
  })

  // Sans retard en cours, l'échec du hook est l'erreur de la story demandée.
  test('notes the a11y hook failing as the error of the story asked', async () => {
    vi.useFakeTimers()
    const { frame, dit } = cadre()
    frame.contentWindow!.addEventListener('message', () => {
      setTimeout(() => dit({ type: 'plugin-error', plugin: 'a11y', message: 'axe threw' }))
    })
    const fini = audit(frame, ['a--b'], () => {})
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
    const fini = audit(frame, ['a--b'], () => {})
    dit({ type: 'ready', protocolVersion: 1 })
    await vi.runAllTimersAsync()

    expect((await fini).map((one) => ('error' in one ? one.error : 'read'))).toEqual([
      'the a11y plugin answered in a shape the shell does not read',
      'the a11y plugin answered in a shape the shell does not read',
    ])
  })

  test('gives up when the preview never says ready', async () => {
    vi.useFakeTimers()
    const { frame } = cadre()
    const fini = audit(frame, ['a--b'], () => {})
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
    { id: 'e--f', theme: 'light', error: 'boum' },
    { id: 'e--f', theme: 'dark', error: 'boum' },
  ]

  // Une erreur n'est pas une story propre : rien ne dit qu'elle est accessible.
  test('counts as clean only a story without violation or error in both themes', () => {
    expect(cleanOf(résultats)).toEqual({ clean: 1, audited: 3 })
  })

  test('lists one finding per story and rule, with its themes', () => {
    expect(findingsOf(résultats).map((one) => [one.key, one.themes])).toEqual([
      ['c--d:x', ['light']],
    ])
  })
})
