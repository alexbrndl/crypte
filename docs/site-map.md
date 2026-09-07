# Arborescence du site

État visé pour `crypte.dev`. Deux règles de structure : **aucune page à plus de deux clics de l'accueil**, et **chaque chapitre numéroté de l'accueil pointe vers une page qui existe**.

```
/                                     accueil
│
├── docs/
│   ├── (index)                       démarrage : installer, init, dev
│   ├── story-format/                 defineStories, props partagées, details
│   ├── config/                       crypte.config.ts, les deux clés obligatoires
│   ├── catalogue/                    les trois types d'entrée
│   ├── manifest/                     forme, versionnement, empreinte commitée
│   ├── contracts/                    entrée de manifeste, plugin, pont preview, hooks node
│   ├── cli/                          init · dev · build · check · migrate
│   ├── adapters/                     react · vue
│   ├── mcp/                          serveur local, ce qu'il expose
│   ├── agent-stories/               écrire des stories avec un agent
│   ├── export/                      l'export au format Storybook
│   ├── migrate/                      depuis Storybook, et l'export retour
│   ├── decisions/                    miroir public de decisions.md
│   └── contributing/
│
├── plugins/
│   ├── (index)                       23 entrées, filtrables : gratuit · payant · actif par défaut
│   └── <nom>/                        une page par paquet
│
├── compare/
│   ├── (index)                       le tableau général
│   ├── storybook/
│   └── documentation-platforms/      zeroheight, Supernova
│
├── for/
│   ├── engineering/                  celui qui installe
│   └── designers/                    celui qui écrit dedans
│
├── pricing/                          la frontière, sans prix jusqu'à la 0.1
├── roadmap/                          les quatre étapes
├── changelog/
├── figma/                            le plugin, publication Community
│
├── llms.txt                          index pour agents
├── llms-full.txt                     contenu complet en un fichier
├── sitemap.xml
└── robots.txt
```

## Ce que l'accueil doit atteindre

| Bloc de l'accueil | Cible |
| --- | --- |
| `0.0` le manifeste | `/docs/story-format/` |
| `1.0 crypte dev` | `/docs/cli/` |
| `1.5` le catalogue | `/plugins/` |
| `2.0 crypte build` | `/docs/catalogue/` |
| `3.0 crypte serve` | `/docs/cli/` — page à écrire quand la commande existe |
| `4.0 crypte migrate` | `/docs/migrate/` |
| `FIG A–F` | `/compare/` |
| Ce qui marche | `/changelog/` et `/roadmap/` |
| Le prix | `/pricing/` |
| Pied de page | `/for/engineering/`, `/for/designers/`, `/figma/`, `/llms.txt` |

## Ordre d'écriture

Sept pages suffisent à ce que l'accueil n'ait aucun lien mort : `docs/`, `docs/story-format/`, `docs/cli/`, `docs/catalogue/`, `plugins/`, `pricing/`, `roadmap/`. Le reste peut suivre.

`llms.txt` est déjà lié depuis le `<head>` et le pied de page de l'accueil, donc il fait partie de ces sept — un lien mort à cet endroit est le plus coûteux du site, sur un projet dont l'argument est le contexte pour agents.

## Ce qui n'est pas prévu

Pas de blog avant qu'il y ait quelque chose à annoncer. Pas de page « customers », pas de témoignages : la crédibilité passe par le changelog et par les mesures, pas par des logos qu'on n'a pas.

Pas de page par plugin payant avant que le plugin existe. La frontière est annoncée sur `/pricing/` et dans `/plugins/`, ce qui suffit à ce que personne ne la découvre à l'installation.
