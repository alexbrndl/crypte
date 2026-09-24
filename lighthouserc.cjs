// Lighthouse sur le shell compilé, comme le CLI le livre. Deux catégories : la
// performance, et surtout l'accessibilité, qui donne un chiffre opposable
// plutôt qu'une intention. Le SEO et les bonnes pratiques ne veulent rien dire
// pour un outil de développement.
//
// Mesuré le 24 septembre 2026 sur le shell d'alors : performance 0,97,
// accessibilité 1. Le seuil d'accessibilité est la mesure elle-même, pour
// qu'une direction d'interface qui la fait baisser le dise ; celui de
// performance laisse la marge que le bruit d'une machine de CI demande.
module.exports = {
  ci: {
    collect: {
      staticDistDir: 'apps/shell/dist',
      numberOfRuns: 1,
      settings: {
        onlyCategories: ['performance', 'accessibility'],
        chromeFlags: '--headless=new',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
      },
    },
  },
}
