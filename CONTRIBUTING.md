# Contribuer

Merci de votre intérêt. Ce document décrit comment installer le projet, le vérifier et proposer une modification.

## Prérequis

Node 22.18 ou plus récent, et [Vite+](https://viteplus.dev), qui fournit la commande `vp` et sélectionne lui-même le gestionnaire de paquets et la version de Node du projet. Aucun gestionnaire de paquets n'est à installer séparément.

## Installation

```bash
vp install
```

## Vérifier

```bash
vp check          # formatage, lint et types
vp run -r pack    # construit les trois paquets
vp test           # tests
```

Ou l'enchaînement complet, dans l'ordre attendu :

```bash
vp run ready
```

**L'ordre compte.** La construction doit précéder les tests : le test d'isolation de `@crypte/core` lit les artefacts construits, pas les sources. Lancé sans construction préalable, il échoue explicitement plutôt que de passer au vert sans rien vérifier.

## Structure

```
packages/core     @crypte/core    noyau, trois entrées : protocol, ui, preview
packages/cli      @crypte/cli     binaire `crypte`
packages/react    @crypte/react   adaptateur React
docs/                             documents publics, en anglais
docs/internal/                    notes du mainteneur, en français
```

`docs/spec-contrats.md` fait foi pour le format de story, le manifeste, le protocole et le contrat de plugin. `docs/internal/architecture.md` détaille le rôle de chaque fichier et ce qui casse en son absence.

**Les notes de conception sont en français**, et elles le restent. Ce que vous lisez pour utiliser Crypte ou pour proposer une modification est en anglais ; ce qui est écrit pour le mainteneur ne l'est pas, parce que ce sont des règles précises dont une traduction approximative perdrait plus qu'elle n'apporterait. Le choix et ce qui le rouvrirait sont dans `docs/decisions.md`.

## Format des modules

Les paquets sont publiés en **ESM uniquement**. Pas de CommonJS.

C'est un choix délibéré pour un outil de développement : Node supporte ESM depuis longtemps, l'écosystème des outils de build a basculé, et maintenir un double format double la surface de test pour un bénéfice qui décroît. Ajouter CommonJS plus tard reste possible sans rupture, le retirer ne le serait pas.

## Commits

Le projet suit les [Conventional Commits](https://www.conventionalcommits.org). Le message est en anglais, à l'impératif.

```
feat: add story discovery
fix: resolve aliases from jsconfig
docs: document the isolation test
chore: bump actions
```

Ce format sert la lisibilité de l'historique. Il ne détermine pas les numéros de version : ceux-ci viendront de notes déposées explicitement, pas des messages de commit.

## Branches et pull requests

Une branche par modification, nommée en kebab-case.

**Le titre de la pull request suit le même format que les messages de commit.** Les pull requests sont fusionnées en squash, donc le titre devient le message du commit sur `main`, et les commits intermédiaires disparaissent. C'est le titre qui reste dans l'historique du projet.

Avant d'ouvrir une pull request, vérifiez que `vp check`, `vp run -r pack` et `vp test` passent en local. L'intégration continue rejoue les trois sur Node 22 et 24, et vérifie en plus que les exports générés commités sont à jour.

**Si votre modification ajoute une pièce mobile**, un workflow, un script, une configuration qui encode une décision, ou un test dont l'assertion n'est pas évidente, mettez à jour `docs/internal/architecture.md` en répondant à trois questions : ce que ça fait, pourquoi ça existe, et ce qui casse si on l'enlève.

À l'inverse, n'ajoutez pas de documentation pour du code qui se lit tout seul.

## Signaler un problème

Ouvrez une issue en décrivant le comportement attendu, le comportement observé, et si possible un cas reproductible minimal.
