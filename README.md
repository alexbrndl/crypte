# Crypte

Atelier de composants et design system, pensé léger et multi-framework.

Un noyau agnostique, un adaptateur par framework, et des plugins que l'on installe à la carte. Rien de ce qui n'est pas installé n'est chargé.

> **Statut : conception.** Aucune implémentation à ce jour. Les contrats sont spécifiés, le format de story a été éprouvé sur cinq composants réels.

## Pourquoi

Storybook est mature mais lourd : configuration coûteuse, démarrage lent, et une majorité de fonctionnalités jamais utilisées. Les alternatives légères sont rapides parce qu'elles se limitent à un seul framework.

Crypte prend le pari inverse : une architecture en couches dès le départ, pour rester léger sans renoncer au multi-framework.

## Principes

**Ne jamais lire le `vite.config` d'un projet.** Crypte lit uniquement des formats standards, indépendants de tout framework, et ce que le projet lui déclare explicitement. C'est ce qui rend la promesse multi-projets tenable.

**Ne couvrir que ce qui est démontré par l'usage.** Un mécanisme ajouté par précaution crée un usage qu'on ne peut plus reprendre. Un mécanisme ajouté après un besoin réel ne casse rien.

**Le shell ne connaît aucun framework.** Il dialogue avec la preview par `postMessage`. Cette frontière est la garantie d'agnosticisme du noyau ; aucune exception n'y sera introduite.

## Documentation

| Document | Contenu |
|---|---|
| [`docs/contracts.md`](docs/contracts.md) | Format de story, manifeste, protocole du canal, contrat de plugin |
| [`docs/internal/test-format-stories.md`](docs/internal/test-format-stories.md) | Test du format sur cinq composants réels, frictions relevées |
| [`docs/internal/plugins.md`](docs/internal/plugins.md) | Catalogue des plugins, nommage, phases |

## Feuille de route

**Phase 1.** Noyau, adaptateur React, plugin `controls`, adaptateur Vue, build statique déployé en continu.

**Phase 2.** `visual-tests`, `docs`, `source`, `responsive`, `theme`, `actions`.

**Phase 3.** `crypte serve` : commentaires et édition des guidelines, avec écriture en pull request.

Chaque plugin est un projet distinct, avec sa propre PRD et ses issues.

## Licence

MIT
