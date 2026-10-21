# Accessibilité

Les règles que chaque composant du système respecte, vérifiées par l'audit de la vue Health.

## Contraste

Le texte atteint un contraste de **4,5:1** sur son fond, 3:1 au-delà de 24 px. Une couleur se choisit dans les tokens, jamais en dur :

```css
color: var(--color-text);
```

## Rôles

Un élément interactif porte un rôle que [la spécification ARIA](https://www.w3.org/TR/wai-aria-1.2/) définit.
