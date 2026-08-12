---
'@crypte/core': minor
---

`wrap` n'accepte plus que des composants : un composant seul, un tableau de composants, ou un couple composant et props. La forme fonction `(story) => …` est retirée.

Pour React un composant est une fonction, donc les deux formes étaient indistinguables et un adaptateur ne pouvait pas savoir s'il devait instancier ce qu'il reçoit ou lui passer l'élément déjà rendu. Les trois formes restantes sont déclaratives, donc interprétables par tous les adaptateurs.

Une valeur calculée passe par les props, où elle est évaluée au chargement du fichier de stories : `wrap: [[Foo, { bar: compute() }]]`.
