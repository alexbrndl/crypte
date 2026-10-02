import type { PreviewContext } from '@crypte/core/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import hooks from '../src/preview'
import type { Results } from '../src/results'

// Les hooks de `a11y` sur le vrai axe-core, dans jsdom : ce qu'ils envoient au
// panneau après une analyse, et l'ordre de deux analyses qui se chevauchent.

const contexte = (html: string, id = 'x--defaut') => {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  const send = vi.fn<PreviewContext['send']>()
  const ctx: PreviewContext = { id, props: {}, options: {}, root, send }
  // Tout ce que la preview a envoyé, dans l'ordre : ses résultats, ici.
  const envoyes = () => send.mock.calls.map(([message]) => message as unknown as Results)
  return { ctx, envoyes }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('an analysis', () => {
  it('sends each violation with its rule, impact and the selector at fault', async () => {
    const { ctx, envoyes } = contexte('<img src="photo.png">')

    await hooks.afterMount?.(ctx)

    expect(envoyes()).toEqual([
      {
        type: 'a11y:results',
        id: 'x--defaut',
        passes: expect.any(Number),
        violations: [
          {
            rule: 'image-alt',
            impact: 'critical',
            help: 'Images must have alternative text',
            helpUrl: expect.stringContaining('/image-alt'),
            targets: ['img'],
          },
        ],
      },
    ])
  })

  it('counts the rules that passed when nothing is at fault', async () => {
    const { ctx, envoyes } = contexte('<img src="photo.png" alt="Une photo">')

    await hooks.afterMount?.(ctx)

    const [message] = envoyes()
    expect(message?.violations).toEqual([])
    expect(message?.passes).toBeGreaterThan(0)
  })

  // Le type d'axe permet une violation sans gravité : elle reste montrée, au
  // plus bas plutôt que perdue.
  it('files a violation without impact as minor', async () => {
    vi.spyOn(window.axe, 'run').mockResolvedValueOnce({
      passes: [],
      violations: [
        { id: 'regle', impact: null, help: 'aide', helpUrl: 'u', nodes: [{ target: ['div'] }] },
      ],
    } as unknown as Awaited<ReturnType<Window['axe']['run']>>)
    const { ctx, envoyes } = contexte('<div></div>')

    await hooks.afterMount?.(ctx)

    expect(envoyes()[0]?.violations).toEqual([
      { rule: 'regle', impact: 'minor', help: 'aide', helpUrl: 'u', targets: ['div'] },
    ])
  })

  // Seul ce que le panneau montre traverse : le HTML de chaque nœud que axe
  // joint à son résultat n'en fait pas partie.
  it('sends nothing the panel does not show', async () => {
    const { ctx, envoyes } = contexte('<img src="photo.png">')

    await hooks.afterMount?.(ctx)

    const [message] = envoyes()
    expect(Object.keys(message ?? {}).sort()).toEqual(['id', 'passes', 'type', 'violations'])
    expect(Object.keys(message?.violations[0] ?? {}).sort()).toEqual([
      'help',
      'helpUrl',
      'impact',
      'rule',
      'targets',
    ])
  })
})

describe('what the panel asks', () => {
  it('analyses again on `a11y:run`', async () => {
    const { ctx, envoyes } = contexte('<img src="photo.png">')

    await hooks.onMessage?.(ctx, { type: 'a11y:run' })

    expect(envoyes().map((one) => one.type)).toEqual(['a11y:results'])
  })

  it('does nothing on another message', async () => {
    const { ctx, envoyes } = contexte('<img src="photo.png">')

    expect(hooks.onMessage?.(ctx, { type: 'a11y:autre' })).toBeUndefined()
    expect(envoyes()).toEqual([])
  })
})

describe('two analyses at once', () => {
  // axe refuse une analyse pendant une autre : « Axe is already running ».
  // Un rendu qui arrive pendant l'analyse du précédent la déclenchait.
  it('runs one after the other, each with its own story', async () => {
    const premier = contexte('<img src="a.png">', 'x--premier')
    const second = contexte('<p>propre</p>', 'x--second')

    await Promise.all([hooks.afterMount?.(premier.ctx), hooks.afterMount?.(second.ctx)])

    expect(premier.envoyes().map((one) => one.id)).toEqual(['x--premier'])
    expect(second.envoyes().map((one) => one.id)).toEqual(['x--second'])
  })

  // Rejetée, pour que le shell nomme l'échec, et sans bloquer la suivante.
  it('rejects a failed analysis and goes on with the next', async () => {
    vi.spyOn(window.axe, 'run').mockRejectedValueOnce(new Error('axe a cassé'))
    const casse = contexte('<p>un</p>')
    const suivante = contexte('<p>deux</p>')

    const echec = hooks.afterMount?.(casse.ctx)
    const reprise = hooks.afterMount?.(suivante.ctx)

    await expect(echec).rejects.toThrow('axe a cassé')
    await reprise
    expect(casse.envoyes()).toEqual([])
    expect(suivante.envoyes()).toHaveLength(1)
  })
})
