// Exécuté dans l'iframe, à l'import. Les hooks de la section 6.2 arrivent avec
// DCJ-322 : d'ici là, cette marque est ce que le cas navigateur lit.
document.documentElement.dataset.hello = 'loaded'
