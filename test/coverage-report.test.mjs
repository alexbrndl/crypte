import { describe, expect, it } from 'vitest'
import { MARKER, badge, bar, compose, existing, options, publish } from './coverage-report.mjs'

// Ce que le commentaire de pull request dit, et ce qu'il remplace. Le script
// écrit sur une pull request : sans ces cas, sa seule épreuve serait une pousse.
// Voir docs/internal/architecture.md.

const metrique = (pct, covered = 1, total = 1) => ({ pct, covered, total, skipped: 0 })

const resume = (pct = 99) => ({
  total: {
    statements: metrique(pct, 726, 746),
    branches: metrique(pct, 455, 512),
    functions: metrique(pct, 149, 150),
    lines: metrique(pct, 615, 623),
  },
})

describe('la barre de progression', () => {
  it('est vide à zéro et pleine à cent', () => {
    expect(bar(0)).toBe('░░░░░░░░░░')
    expect(bar(100)).toBe('██████████')
  })

  // Une barre pleine à 97 % ferait croire qu'il ne reste rien à couvrir.
  it('n’est jamais pleine en dessous de cent', () => {
    expect(bar(97.31)).toBe('█████████░')
    expect(bar(99.99)).toBe('█████████░')
  })
})

describe('le corps du commentaire', () => {
  // Le marqueur est ce qui permet de retrouver le commentaire pour le remplacer.
  it('commence par le marqueur, seul sur sa première ligne', () => {
    expect(compose(resume(), undefined, undefined).split('\n')[0]).toBe(MARKER)
  })

  it('compte les tests quand le rapport est là', () => {
    const body = compose(resume(), {
      numTotalTests: 404,
      numFailedTests: 0,
      testResults: Array(31),
    })

    expect(body).toContain('**404 tests passent**, dans 31 fichiers.')
  })

  it('dit les échecs plutôt que le total', () => {
    const body = compose(resume(), {
      numTotalTests: 404,
      numFailedTests: 2,
      testResults: Array(31),
    })

    expect(body).toContain('**2 tests échouent** sur 404')
  })

  // Sans rapport, ne rien prétendre : annoncer zéro test se lirait comme une
  // suite vide, et une suite vide passe toujours.
  it('ne prétend rien quand le rapport des tests manque', () => {
    expect(compose(resume(), undefined)).toContain('Résultat des tests indisponible.')
  })

  it('marque d’une croix la métrique sous son seuil', () => {
    const body = compose(resume(50))

    expect(body).toContain('❌')
    expect(body).not.toContain('✅')
  })

  it('marque d’une coche la métrique au-dessus de son seuil', () => {
    expect(compose(resume(99))).not.toContain('❌')
  })

  it('abrège la révision mesurée', () => {
    expect(compose(resume(), undefined, 'abcdef1234567')).toContain('`abcdef1`')
  })

  // Un résumé illisible doit lever, pas produire un tableau vide qui se lirait
  // comme une couverture nulle.
  it('lève sur un résumé sans total', () => {
    expect(() => compose({}, undefined)).toThrow('résumé de couverture illisible')
  })
})

describe('la publication', () => {
  const faux = (comments) => {
    const calls = []

    return {
      calls,
      run: (args) => {
        calls.push(args.join(' '))
        if (args[0] === 'pr') return JSON.stringify(comments)
        if (args[0] === 'repo') return 'alexbrndl/crypte'
        return ''
      },
    }
  }

  it('poste quand aucun commentaire ne porte le marqueur', () => {
    const gh = faux([{ id: 1, body: 'un commentaire humain' }])

    expect(publish('corps', '34', gh.run)).toBe('posté')
    expect(gh.calls.some((one) => one.includes('--method POST'))).toBe(true)
  })

  // Sans le remplacement, une pull request de quinze pousses porterait quinze
  // tableaux, et le dernier serait le seul vrai.
  it('remplace le commentaire qui porte le marqueur', () => {
    const gh = faux([{ id: 7, body: `${MARKER}\nun vieux tableau` }])

    expect(publish('corps', '34', gh.run)).toBe('remplacé')
    expect(gh.calls.some((one) => one.includes('issues/comments/7 --method PATCH'))).toBe(true)
  })

  it('trouve l’identifiant par le marqueur, et rien d’autre', () => {
    expect(existing([{ id: 3, body: `${MARKER} x` }])).toBe(3)
    expect(existing([{ id: 3, body: 'sans marqueur' }])).toBeUndefined()
    expect(existing([{ id: 3 }])).toBeUndefined()
  })
})

describe('les arguments', () => {
  it('lit les chemins par défaut', () => {
    expect(options([])).toEqual({
      pr: undefined,
      resume: 'coverage/coverage-summary.json',
      tests: '.vitest-report.json',
      sha: undefined,
    })
  })

  // Sans `--pr`, le corps part sur la sortie standard et rien n'est publié :
  // c'est le régime du résumé de job.
  it('ne publie que sur --pr', () => {
    expect(options(['--pr', '34']).pr).toBe('34')
    expect(options(['--sha', 'abc']).pr).toBeUndefined()
  })
})

describe('le badge du README', () => {
  // Arrondi vers le bas : 98,55 affiché « 99 % » flatterait.
  it('rend le format que shields.io lit, arrondi vers le bas', () => {
    expect(badge(resume(98.55))).toEqual({
      schemaVersion: 1,
      label: 'coverage',
      message: '98%',
      color: 'brightgreen',
    })
  })

  // Un badge vert sous le seuil mentirait sur une porte rouge.
  it('n’est vert vif qu’au-dessus du seuil de lignes', () => {
    expect(badge(resume(97)).color).toBe('brightgreen')
    expect(badge(resume(96.9)).color).toBe('yellow')
    expect(badge(resume(86)).color).toBe('red')
  })

  it('lève sur un résumé sans pourcentage de lignes', () => {
    expect(() => badge({ total: {} })).toThrow('résumé de couverture illisible')
  })
})
