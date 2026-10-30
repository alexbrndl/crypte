import type { PageEntry, StoryEntry, TokensEntry, TokenValue } from '@crypte/core/protocol'
import { beforeEach, describe, expect, test } from 'vitest'
import type { AuditResult, Violation } from '../src/health/audit'
import {
  abbreviationsOf,
  columnsOf,
  criteriaOf,
  dashboardOf,
  defaultSelection,
  groupOf,
  keptSelection,
  ORPHANS,
  phraseOf,
  scoreOf,
  tokenHealthOf,
  type Causes,
  type Criteria,
  type State,
} from '../src/health/dashboard'
import type { HealthComponent } from '../src/health/health'
import { locale } from '../src/i18n'
import { categoriesOf } from '../src/tokens/categories'

// Le calcul du dashboard de la santé : chaque ligne du tableau des critères, les
// groupes, les comptes, le score, la couverture des tokens et les abréviations.

beforeEach(() => {
  locale.value = 'en'
})

const composant = (over: Partial<HealthComponent> = {}): HealthComponent => ({
  name: 'Badge',
  file: 'src/Badge.tsx',
  export: 'Badge',
  stories: ['badge--a'],
  props: 2,
  required: 0,
  status: 'stable',
  usedIn: ['src/app.tsx'],
  ...over,
})

const story = (id: string, over: Partial<StoryEntry> = {}): StoryEntry => ({
  type: 'story',
  id,
  path: ['Badge'],
  name: id,
  component: { name: 'Badge', file: 'src/Badge.tsx', export: 'Badge' },
  storyFile: 'stories/Badge.tsx',
  options: {},
  details: {},
  props: [],
  source: '',
  ...over,
})

const page = (storyFile?: string): PageEntry => ({
  type: 'page',
  id: 'page--badge',
  path: [],
  name: 'Badge',
  file: 'stories/Badge.md',
  body: '',
  ...(storyFile ? { storyFile } : {}),
})

const violation = (impact: Violation['impact'], rule = 'button-name'): Violation => ({
  rule,
  impact,
  help: rule,
  helpUrl: 'u',
  targets: ['b'],
})

// Les deux thèmes d'une story, du même résultat.
const rendue = (id: string, result: Record<string, unknown>): AuditResult[] =>
  (['light', 'dark'] as const).map((theme) => ({ id, theme, ...result }) as AuditResult)

const jugée = (id: string, violations: Violation[] = []) => rendue(id, { passes: 3, violations })

const contexte = (over: Partial<Causes> = {}): Causes => ({
  stories: [story('badge--a')],
  pages: [page('stories/Badge.tsx')],
  audit: jugée('badge--a'),
  components: [],
  categories: [],
  ...over,
})

const états = (criteria: Criteria) =>
  Object.fromEntries(Object.entries(criteria).map(([key, cell]) => [key, cell.state]))

describe('the criteria of a component', () => {
  test('are all valid on a component with nothing to fix', () => {
    expect(états(criteriaOf(composant(), contexte()))).toEqual({
      story: 'valid',
      render: 'valid',
      a11y: 'valid',
      doc: 'valid',
      status: 'valid',
      props: 'valid',
      usages: 'valid',
    })
  })

  // Sans story : à améliorer pour la story, vide là où il faudrait en avoir une.
  test('leave empty what needs a story, on a component without one', () => {
    const criteria = criteriaOf(composant({ stories: [] }), contexte({ stories: [], audit: [] }))
    expect(états(criteria)).toEqual({
      story: 'improve',
      render: 'empty',
      a11y: 'empty',
      doc: 'empty',
      status: 'valid',
      props: 'empty',
      usages: 'valid',
    })
  })

  test.for([
    ['the audit has not run', null, 'empty', 'empty'],
    ['a story is broken', rendue('badge--a', { broken: 'Boom' }), 'blocking', 'empty'],
    [
      'one theme is broken',
      [
        ...rendue('badge--a', { drawn: true }).slice(0, 1),
        ...rendue('badge--a', { broken: 'B' }).slice(1),
      ],
      'blocking',
      'empty',
    ],
    ['a story stayed silent', rendue('badge--a', { silent: true }), 'empty', 'empty'],
    ['one theme is missing', jugée('badge--a').slice(0, 1), 'empty', 'empty'],
    ['it is drawn without the a11y plugin', rendue('badge--a', { drawn: true }), 'valid', 'empty'],
    ['the analysis failed', rendue('badge--a', { error: 'x' }), 'valid', 'empty'],
    ['a critical violation', jugée('badge--a', [violation('critical')]), 'valid', 'blocking'],
    ['a serious violation', jugée('badge--a', [violation('serious')]), 'valid', 'improve'],
    ['a minor violation', jugée('badge--a', [violation('minor')]), 'valid', 'improve'],
    ['no violation', jugée('badge--a'), 'valid', 'valid'],
  ] as const)('render and a11y when %s', ([, audit, render, a11y]) => {
    const criteria = criteriaOf(
      composant(),
      contexte({ audit: audit === null ? null : [...audit] }),
    )
    expect([criteria.render.state, criteria.a11y.state]).toEqual([render, a11y])
  })

  // Toutes les stories du composant comptent, pas seulement la première.
  test('render and a11y read every story of the component', () => {
    const criteria = criteriaOf(
      composant({ stories: ['badge--a', 'badge--b'] }),
      contexte({ audit: [...jugée('badge--a'), ...rendue('badge--b', { broken: 'B' })] }),
    )
    expect([criteria.render.state, criteria.a11y.state]).toEqual(['blocking', 'empty'])
  })

  test.for([
    ['a page belongs to its story file', [page('stories/Badge.tsx')], 'valid'],
    ['the page belongs to another story file', [page('stories/Autre.tsx')], 'improve'],
    ['a page belongs to no story file', [page()], 'improve'],
    ['there is no page', [], 'improve'],
  ] as const)('doc when %s', ([, pages, state]) => {
    expect(criteriaOf(composant(), contexte({ pages: [...pages] })).doc.state).toBe(state)
  })

  test.for([
    ['stable', 'valid'],
    ['deprecated', 'improve'],
    ['draft', 'empty'],
    [undefined, 'empty'],
  ] as const)('status %s', ([status, state]) => {
    const one = composant()
    delete one.status
    const criteria = criteriaOf(status ? { ...one, status } : one, contexte())
    expect(criteria.status.state).toBe(state)
  })

  test('props, with what is exercised over what exists', () => {
    expect(
      criteriaOf(composant({ props: 5, unexercised: ['sourceUrl'] }), contexte()).props,
    ).toEqual({ state: 'improve', text: '4/5' })
    expect(criteriaOf(composant({ props: 3 }), contexte()).props).toEqual({
      state: 'valid',
      text: '3/3',
    })
    // Rien à écrire dans la case d'un composant sans prop.
    expect(criteriaOf(composant({ props: 0 }), contexte()).props).toEqual({ state: 'valid' })
  })

  // Un spread cache ce qu'une story donne : la couverture est inconnue.
  test('props stay empty when a story spreads an object', () => {
    const criteria = criteriaOf(
      composant({ props: 5 }),
      contexte({ stories: [story('badge--a', { partial: '...base' })] }),
    )
    expect(criteria.props).toEqual({ state: 'empty' })
  })

  test('usages, with the number of files', () => {
    expect(criteriaOf(composant({ usedIn: ['a', 'b'] }), contexte()).usages).toEqual({
      state: 'valid',
      text: '2',
    })
    const nulle = composant()
    delete nulle.usedIn
    expect(criteriaOf(nulle, contexte()).usages).toEqual({ state: 'improve', text: '0' })
  })
})

describe('the group of a component', () => {
  const avec = (over: Partial<Record<keyof Criteria, State>>): Criteria => ({
    story: { state: 'valid' },
    render: { state: 'valid' },
    a11y: { state: 'valid' },
    doc: { state: 'valid' },
    status: { state: 'valid' },
    props: { state: 'valid' },
    usages: { state: 'valid' },
    ...Object.fromEntries(Object.entries(over).map(([key, state]) => [key, { state }])),
  })

  test.for([
    ['all seven valid', {}, 'ready'],
    ['one to improve', { doc: 'improve' }, 'improve'],
    ['only an empty cell left', { status: 'empty' }, 'improve'],
    ['one blocking among improvements', { doc: 'improve', render: 'blocking' }, 'blocking'],
  ] as const)('%s', ([, over, group]) => {
    expect(groupOf(avec(over))).toBe(group)
  })
})

describe('the phrase of a component', () => {
  const phrase = (component: HealthComponent, causes: Causes) =>
    phraseOf(component, criteriaOf(component, causes), causes)

  test('names the blocking causes first', () => {
    const causes = contexte({
      audit: [
        ...rendue('badge--a', { broken: 'B' }).slice(0, 1),
        ...jugée('badge--a', [violation('critical')]).slice(1),
      ],
      pages: [],
    })
    expect(phrase(composant(), causes)).toBe(
      'fails to render, light · button-name critical · doc page missing',
    )
  })

  test('names both themes when the story fails in both', () => {
    expect(phrase(composant(), contexte({ audit: rendue('badge--a', { broken: 'B' }) }))).toBe(
      'fails to render, light and dark',
    )
  })

  test('says deprecated alone when nothing imports it', () => {
    expect(phrase(composant({ status: 'deprecated' }), contexte())).toBe('deprecated')
  })

  test('says what is missing on a component without story', () => {
    const component = composant({ stories: [], props: 3, required: 1 })
    expect(phrase(component, contexte({ stories: [], audit: [] }))).toBe(
      'no story · 3 props, 1 required',
    )
  })

  test('names who still imports a deprecated component, and what is never exercised', () => {
    const autre = composant({ name: 'OrderSummary', file: 'src/Order.tsx', export: 'OrderSummary' })
    const component = composant({
      status: 'deprecated',
      usedBy: ['src/Order.tsx:OrderSummary'],
      unexercised: ['onClose'],
    })
    expect(phrase(component, contexte({ components: [autre, component] }))).toBe(
      'deprecated · OrderSummary · onClose never exercised',
    )
  })

  test('says draft and used nowhere, in French too', () => {
    const component = composant({ status: 'draft', unexercised: ['a', 'b'] })
    delete component.usedIn
    expect(phrase(component, contexte({ pages: [] }))).toBe(
      'doc page missing · a, b never exercised · used nowhere · draft',
    )
    locale.value = 'fr'
    expect(phrase(component, contexte({ pages: [] }))).toBe(
      'page de doc manquante · a, b jamais exercées · utilisé nulle part · draft',
    )
  })

  test('names the most serious violation, with the token behind a contrast defect', () => {
    const families: TokensEntry[] = [
      {
        type: 'tokens',
        id: 'tokens--text',
        path: ['Tokens'],
        name: 'text',
        tokens: { subtle: { type: 'color', themes: { default: { value: '#777777' } } } },
      },
    ]
    const contrast = { ...violation('serious', 'color-contrast'), colors: ['#777777', '#ffffff'] }
    const causes = contexte({
      audit: jugée('badge--a', [violation('minor', 'region'), contrast]),
      categories: categoriesOf(families),
    })
    expect(phrase(composant(), causes)).toBe('color-contrast serious · --text-subtle')
  })
})

describe('the columns and the score', () => {
  test('count the valid ones over those not empty, and average the ratios', () => {
    const causes = contexte()
    const all = [
      composant(),
      composant({ name: 'Card', file: 'src/Card.tsx', export: 'Card', stories: [], props: 0 }),
    ].map((one) => criteriaOf(one, causes))
    const columns = columnsOf(all)

    expect(columns.story).toEqual({ valid: 1, total: 2 })
    // Le composant sans story a sa case vide : il ne compte pas.
    expect(columns.render).toEqual({ valid: 1, total: 1 })
    // story 1/2, cinq colonnes à 1, usages 2/2 et la couverture 3/4.
    expect(scoreOf(columns, { valid: 3, total: 4 })).toBe(Math.round(((0.5 + 6 + 0.75) / 8) * 100))
  })

  // Une colonne sans dénominateur ne compte pas, ni une couverture sans token.
  test('leave out a ratio with nothing to count', () => {
    const columns = columnsOf([criteriaOf(composant(), contexte({ audit: null }))])
    expect(columns.render).toEqual({ valid: 0, total: 0 })
    expect(scoreOf(columns, { valid: 0, total: 0 })).toBe(100)
    expect(scoreOf(columnsOf([]), { valid: 0, total: 0 })).toBe(0)
  })
})

const valeur = (value: string, alias?: string[]): TokenValue => ({
  type: 'color',
  themes: { default: alias ? { value, alias } : { value } },
})

const familles: TokensEntry[] = [
  {
    type: 'tokens',
    id: 'tokens--gris',
    path: ['Tokens'],
    name: 'gris',
    tokens: { '500': valeur('#777'), '100': valeur('#eee') },
  },
  {
    type: 'tokens',
    id: 'tokens--text',
    path: ['Tokens'],
    name: 'text',
    tokens: {
      subtle: valeur('#777', ['gris-500']),
      // Une cible qui n'existe pas : la valeur reste le `var()`.
      chart: valeur('var(--teal-450)', ['teal-450']),
      // Composite, sans chaîne : pas un alias, donc pas cassé.
      motion: valeur('var(--a, 1ms) var(--b, ease)'),
    },
  },
]

describe('the coverage of the tokens', () => {
  test('follows the aliases, finds the orphans and the broken aliases', () => {
    const lecteur = composant({ tokens: ['text-subtle', 'text-chart', 'pas-un-token'] })
    const coverage = tokenHealthOf(familles, [lecteur])
    const état = Object.fromEntries(
      coverage.families.flatMap((family) =>
        family.tokens.map((one) => [one.name, [one.state, one.readers.length, one.target]]),
      ),
    )

    expect(état).toEqual({
      'gris-500': ['used', 1, undefined],
      'gris-100': ['orphan', 0, undefined],
      'text-subtle': ['used', 1, undefined],
      'text-chart': ['broken', 1, 'teal-450'],
      'text-motion': ['orphan', 0, undefined],
    })
    // Utilisés, orphelins et cassés font le total ; ce qui n'est pas un token
    // du projet n'est pas lu.
    expect([coverage.used, coverage.orphans, coverage.broken, coverage.total]).toEqual([2, 2, 1, 5])
    expect([...coverage.reads.get('src/Badge.tsx:Badge')!].sort()).toEqual([
      'gris-500',
      'text-chart',
      'text-subtle',
    ])
  })

  test('marks a suspect, which stays used', () => {
    const coverage = tokenHealthOf(
      familles,
      [composant({ tokens: ['text-subtle'] })],
      new Set(['tokens--text/subtle']),
    )
    const subtle = coverage.families[1]!.tokens.find((one) => one.name === 'text-subtle')!
    expect([subtle.state, subtle.suspect]).toEqual(['used', true])
  })

  // Une composite au bout d'une chaîne, ou en repli d'une cible absente, n'est pas
  // un alias cassé : seule l'est une valeur restée un `var()` entier.
  test('does not take a composite reached by a chain for a broken alias', () => {
    const motion: TokensEntry = {
      type: 'tokens',
      id: 'tokens--motion',
      path: ['Tokens'],
      name: 'motion',
      tokens: {
        base: valeur('var(--a, 1ms) var(--b, ease)'),
        fast: valeur('var(--a, 1ms) var(--b, ease)', ['motion-base']),
        fallback: valeur('var(--a) var(--b)', ['absent']),
        missing: valeur('var(--absent, var(--a))', ['absent']),
        quoted: valeur("var(--b, 'a ) b')", ['b']),
        unclosed: valeur('var(--a, calc(1px)', ['a']),
        // Un guillemet échappé ne ferme pas la chaîne : la `)` reste du texte.
        escaped: valeur("var(--b, 'a \\' ) b')", ['b']),
      },
    }
    const states = tokenHealthOf([motion], []).families[0]!.tokens.map((one) => [
      one.name,
      one.state,
    ])
    expect(states).toEqual([
      ['motion-base', 'orphan'],
      ['motion-fast', 'orphan'],
      ['motion-fallback', 'orphan'],
      ['motion-missing', 'broken'],
      ['motion-quoted', 'broken'],
      ['motion-unclosed', 'orphan'],
      ['motion-escaped', 'broken'],
    ])
  })

  // Un cycle laisse aussi un `var()` au bout de la chaîne.
  test('takes a cycle for a broken alias, in any theme', () => {
    const cycle: TokensEntry = {
      type: 'tokens',
      id: 'tokens--x',
      path: ['Tokens'],
      name: 'x',
      tokens: {
        a: {
          type: 'color',
          themes: {
            light: { value: '#000' },
            dark: { value: 'var(--x-a)', alias: ['x-b', 'x-a'] },
          },
        },
      },
    }
    expect(tokenHealthOf([cycle], []).families[0]!.tokens[0]).toMatchObject({
      state: 'broken',
      target: 'x-a',
    })
  })
})

describe('the abbreviations of the grid', () => {
  test.for([
    [['PricingCard'], ['PriC']],
    [
      ['AccountPanel', 'AccountPicker'],
      ['AcPa', 'AcPi'],
    ],
    [
      ['AccountBar', 'AccountBadge'],
      ['ABar', 'ABad'],
    ],
    [['Button'], ['Butt']],
    [['button'], ['butt']],
    [['myButton'], ['myB']],
    [
      ['health-panel', 'health-view', 'health-sidebar', 'token_panel'],
      ['heap', 'heav', 'heas', 'tokp'],
    ],
  ] as const)('%s', ([names, abbreviations]) => {
    expect(abbreviationsOf([...names])).toEqual(abbreviations)
  })

  // Quatre lettres au plus, toujours ; un doublon sans autre candidat reste.
  test('never go beyond four letters, and keep a duplicate with no candidate left', () => {
    const shown = abbreviationsOf(['Button', 'Buttons', 'OrderSummaryCard', 'AB', 'A'])
    expect(shown).toEqual(['Butt', 'Butt', 'OrdS', 'AB', 'A'])
    expect(shown.every((one) => one.length <= 4)).toBe(true)
  })
})

describe('the dashboard', () => {
  const bloquant = composant({
    name: 'Zeta',
    file: 'src/Zeta.tsx',
    export: 'Zeta',
    stories: ['zeta--a'],
  })
  const prêt = composant({
    name: 'Alpha',
    file: 'src/Alpha.tsx',
    export: 'Alpha',
    stories: ['alpha--a'],
  })
  const àFaire = composant({ name: 'Beta', file: 'src/Beta.tsx', export: 'Beta', stories: [] })
  const causes = contexte({
    stories: [
      story('zeta--a', { storyFile: 'stories/Zeta.tsx' }),
      story('alpha--a', { storyFile: 'stories/Alpha.tsx' }),
    ],
    pages: [page('stories/Zeta.tsx'), page('stories/Alpha.tsx')],
    audit: [...rendue('zeta--a', { broken: 'B' }), ...jugée('alpha--a')],
  })
  const dashboard = dashboardOf([prêt, àFaire, bloquant], familles, causes)

  test('sorts the rows by group, then by name', () => {
    expect(dashboard.rows.map((one) => [one.component.name, one.group])).toEqual([
      ['Zeta', 'blocking'],
      ['Beta', 'improve'],
      ['Alpha', 'ready'],
    ])
  })

  test('counts the blocking, components and broken aliases together', () => {
    expect(dashboard.blocking).toBe(2)
  })

  // Les prêts ne se cochent pas ; les orphelins tiennent une seule ligne.
  test('lists the checkable rows, and checks the blocking ones by default', () => {
    expect(dashboard.checkable).toEqual([
      'src/Zeta.tsx:Zeta',
      'src/Beta.tsx:Beta',
      'token:text-chart',
      ORPHANS,
    ])
    expect([...defaultSelection(dashboard)]).toEqual(['src/Zeta.tsx:Zeta', 'token:text-chart'])
  })

  // Un défaut de contraste désigne le token de la couleur mesurée.
  test('marks the tokens a contrast defect points at', () => {
    const contrast = { ...violation('serious', 'color-contrast'), colors: ['#eee'] }
    const suspects = dashboardOf([prêt], familles, {
      ...causes,
      audit: jugée('alpha--a', [contrast]),
      categories: categoriesOf(familles),
    })
      .coverage.families.flatMap((family) => family.tokens)
      .filter((one) => one.suspect)
      .map((one) => one.name)
    expect(suspects).toEqual(['gris-100'])
  })

  // Sans orphelin, pas de ligne repliée à cocher.
  test('has no orphans row when every token is read', () => {
    const lue: TokensEntry[] = [
      {
        type: 'tokens',
        id: 'tokens--a',
        path: ['Tokens'],
        name: 'a',
        tokens: { b: valeur('#000') },
      },
    ]
    const seul = dashboardOf([composant({ tokens: ['a-b'] })], lue, contexte())
    expect([seul.coverage.orphans, seul.checkable.includes(ORPHANS)]).toEqual([0, false])
  })

  test('keeps a selection through a reload, dropping only the rows gone', () => {
    const kept = keptSelection(
      new Set(['src/Beta.tsx:Beta', 'src/Gone.tsx:Gone', ORPHANS]),
      dashboard,
    )
    expect([...kept]).toEqual(['src/Beta.tsx:Beta', ORPHANS])
  })
})
