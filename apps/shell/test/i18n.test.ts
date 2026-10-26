import { afterEach, describe, expect, test, vi } from 'vitest'
import { nextTick } from 'vue'

// La langue du shell : celle du navigateur, puis le choix retenu. Le module lit
// sa langue de départ à l'import, d'où un import neuf par cas.

const fresh = async () => {
  vi.resetModules()
  return {
    ...(await import('../src/i18n')),
    plural: (await import('../src/plural')).plural,
  }
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  document.documentElement.lang = ''
})

describe('the language of the shell', () => {
  test.for([
    ['fr-CH', 'fr'],
    ['fr', 'fr'],
    ['en-US', 'en'],
    ['de-DE', 'en'],
  ] as const)('starts in %s as %s, and says it on the page', async ([navigateur, langue]) => {
    vi.stubGlobal('navigator', { language: navigateur })
    const { locale } = await fresh()

    expect(locale.value).toBe(langue)
    expect(document.documentElement.lang).toBe(langue)
  })

  test('keeps the choice over the browser, from one visit to the next', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { setLocale } = await fresh()
    setLocale('fr')
    await nextTick()

    expect(document.documentElement.lang).toBe('fr')
    expect((await fresh()).locale.value).toBe('fr')
  })

  test('ignores a stored value that is not a language it has', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    localStorage.setItem('crypte:locale', JSON.stringify('de'))

    expect((await fresh()).locale.value).toBe('fr')
  })

  test('gives each text in the language of the moment, its parameters written in', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { setLocale, texts } = await fresh()
    const t = texts({
      en: { reload: 'Reload', count: '{n} left of {total}' },
      fr: { reload: 'Recharger', count: '{n} restants sur {total}' },
    })

    expect([t('reload'), t('count', { n: 2, total: 5 })]).toEqual(['Reload', '2 left of 5'])
    setLocale('fr')
    expect([t('reload'), t('count', { n: 2, total: 5 })]).toEqual(['Recharger', '2 restants sur 5'])
  })

  // Une valeur qui porte un `$&` est écrite telle quelle.
  test('writes a value as it is, a dollar sign included', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { texts } = await fresh()
    const t = texts({ en: { file: 'in {name}' }, fr: { file: 'dans {name}' } })
    const name = ['$', '&.tsx'].join('')

    expect(t('file', { name })).toBe(`in ${name}`)
  })

  // La traduction porte les mêmes paramètres que l'anglais : un oubli, un de
  // trop ou une clé manquante ne compile pas. Éprouvé par le compilateur seul.
  test('refuses a translation that loses or adds a parameter', async () => {
    const { texts } = await fresh()
    // @ts-expect-error un paramètre perdu
    texts({ en: { a: '{n} left' }, fr: { a: 'restants' } })
    // @ts-expect-error un paramètre de trop
    texts({ en: { a: 'left' }, fr: { a: '{n} restants' } })
    // @ts-expect-error une clé manquante
    texts({ en: { a: 'left', b: 'x' }, fr: { a: 'restants' } })
    const t = texts({ en: { a: '{n} left', b: 'x' }, fr: { a: '{n} restants', b: 'x' } })
    // @ts-expect-error un paramètre manquant à l'appel
    t('a')
    // @ts-expect-error une valeur sans paramètre à écrire
    t('b', { n: 1 })
    expect(t('a', { n: 3 })).toBe('3 left')
  })

  test('writes a decimal number the way the language does', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { decimal, setLocale } = await fresh()

    expect(decimal(1.43)).toBe('1.4')
    setLocale('fr')
    expect(decimal(1.43)).toBe('1,4')
  })

  // Un texte produit avant un changement de langue se lit après lui : la ligne
  // d'état et l'échec d'un audit suivent le sélecteur.
  test('reads a text made before a change of language in the new one', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { setLocale } = await fresh()
    const { unreadable } = await import('../src/navigation/recover')
    const { AuditFailure } = await import('../src/health/audit')
    const said = unreadable(new Error('boum'))
    const failure = new AuditFailure(() => (said().startsWith('the') ? 'en' : 'fr'))

    expect(said()).toBe('the catalogue could not be read: boum')
    setLocale('fr')
    expect(said()).toBe("le catalogue n'a pas pu être lu : boum")
    expect(failure.text()).toBe('fr')
  })

  // En français, zéro et un prennent le singulier.
  test('agrees a count with its noun by the rule of the language', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { setLocale, plural } = await fresh()

    expect([0, 1, 2].map((n) => plural(n, 'story', 'stories'))).toEqual([
      '0 stories',
      '1 story',
      '2 stories',
    ])
    setLocale('fr')
    expect([0, 1, 2].map((n) => plural(n, 'story', 'stories'))).toEqual([
      '0 story',
      '1 story',
      '2 stories',
    ])
  })
})
