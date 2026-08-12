# Crypte, spécification des contrats

> Version 0.8, document de référence. Toute PRD de projet pointe vers ce document plutôt que de redéfinir ces structures.
>
> **v0.8 :** le canal s'étend comme le reste du protocole, et la version du manifeste reste comparable. Voir le journal en section 8.

---

## 0. Portée

Cette spécification couvre les quatre surfaces coûteuses à changer une fois le projet lancé :

1. Le **format de story**, API publique écrite à la main par les développeurs.
2. Le **manifeste**, contrat entre le CLI et le noyau.
3. Le **protocole du canal**, contrat entre le shell et la preview.
4. Le **contrat de plugin**, contrat pour tous les plugins à venir.

Tout le reste relève des PRD de chaque projet et peut changer librement.

**Deux principes directeurs.**

Crypte ne lit jamais le `vite.config` d'un projet. Il lit uniquement des formats standards, indépendants de tout framework, et ce que le projet lui déclare explicitement.

Cette spécification ne cherche pas à couvrir tous les cas. Elle couvre ce qui est démontré par l'usage réel, et laisse le reste arriver par les retours et les bugs. Un mécanisme ajouté par précaution crée un usage qu'on ne peut plus reprendre ; un mécanisme ajouté après un besoin réel ne casse rien.

---

## 1. Conventions de fichiers

### 1.1 Emplacement

Les stories vivent dans un dossier séparé, à la racine du projet, dont l'arborescence reflète celle des composants.

```
src/components/checkout/OrderSummary.tsx
stories/checkout/OrderSummary.ts
```

Le fichier de story porte **exactement le nom du composant**. L'arbre affiché dans la sidebar est déduit du chemin relatif à la racine des stories, sans aucune déclaration de titre.

L'extension par défaut est `.ts`. Deux cas imposent `.tsx` : un `wrap` sous forme de fonction (section 2.5) et une prop `children` structurée, fréquente sur les composants composés de type `Tabs` ou `Card`. Les deux extensions sont acceptées indifféremment.

### 1.2 Vérification

La commande `crypte check` signale deux anomalies :

- **Story orpheline** : le composant référencé n'existe plus.
- **Composant sans story** : un composant exporté n'a aucune story (avertissement, non bloquant).

Le second contrôle ne s'applique qu'aux exports **identifiés comme composants** : nom à initiale capitale et retour de type élément. Les fonctions utilitaires exportées depuis un fichier de composant, par exemple `stepFromProgress` dans `ProgressLoader.tsx`, ne doivent jamais être signalées.

**En cas de doute, ne rien signaler.** Un avertissement faux coûte plus cher qu'un oubli : il apprend à ignorer la commande.

### 1.3 Fixtures

Les props volumineuses (objets métier, dictionnaires de traduction) ne s'écrivent pas dans les fichiers de stories. Elles vivent dans des fixtures partagées et sont importées, exactement comme le fait le code applicatif.

```ts
import { planPro } from '@/fixtures/plans'
```

Crypte n'impose aucun emplacement ni aucune convention de nommage : ce sont des modules ordinaires, résolus par les alias du projet.

### 1.4 Paquets et installation

Le projet est entièrement scopé sous `@crypte`. Deux paquets à installer :

```bash
npm i -D @crypte/cli @crypte/react
```

| Paquet | Rôle | Installé par l'utilisateur |
|---|---|---|
| `@crypte/cli` | Binaire `crypte`, `defineConfig` | oui |
| `@crypte/react`, `@crypte/vue` | Adaptateur, `defineStories`, `story` | oui, celui de son framework |
| `@crypte/core` | Noyau, dépendance interne | non, jamais importé |
| `@crypte/<plugin>` | Plugins, à la carte | à la demande |

Le nom du paquet et celui de la commande sont indépendants : `@crypte/cli` déclare un binaire nommé `crypte`, et l'utilisateur tape `crypte dev`.

**`defineStories` et `story` sont exportés par l'adaptateur, pas par un paquet agnostique.** L'adaptateur connaît le framework, donc l'inférence de types sur les props est plus précise. Un projet Vue importe depuis `@crypte/vue`, sans autre changement.

### 1.5 Configuration du projet

Un fichier `crypte.config.ts` à la racine :

```ts
import { defineConfig } from '@crypte/cli'
import react from '@crypte/react'
import controls from '@crypte/controls'
import { ThemeProvider } from './src/lib/theme'

export default defineConfig({
  stories: 'stories',
  css: 'src/styles/app.css',
  adapter: react(),
  wrap: ThemeProvider,
  plugins: [controls()],
  vite: { plugins: [] },
})
```

| Clé | Rôle | Obligatoire |
|---|---|---|
| `stories` | Racine des fichiers de stories | oui |
| `css` | Entrée CSS chargée dans la preview | non |
| `adapter` | Adaptateur de framework | oui |
| `wrap` | Enveloppe globale, appliquée à toutes les stories | non |
| `plugins` | Plugins Crypte activés | non |
| `vite` | Plugins Vite déclarés explicitement par le projet | non |

Les alias de chemins sont lus automatiquement depuis `tsconfig.json` ou `jsconfig.json` (champ `compilerOptions.paths`). Aucune déclaration n'est nécessaire.

Le champ `vite.plugins` existe pour les cas où un framework impose une transformation supplémentaire, par exemple les auto-imports de Nuxt. Le projet la déclare, Crypte ne la devine jamais.

---

## 2. Format de story

### 2.1 Forme générale

```ts
import { defineStories, story } from '@crypte/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import OrderSummary from '@/components/checkout/OrderSummary'

export default defineStories(OrderSummary, {
  wrap: TooltipProvider,
  props: {
    bannerLabel: 'Votre commande est confirmée !',
    title: 'Formule Complète + 2 modules',
    benefits: ['Historique complet', 'Données vérifiées', 'Sinistres'],
  },
  stories: {
    'Par défaut': {},
    'Avec référence': { reference: 'REF-4821-KD' },
    'Depuis une annonce': { sourceLabel: 'marketplace.example.com/l/123' },
    'Replié sur mobile': story({ reference: 'REF-4821…' }, { responsive: 'mobile' }),
  },
})
```

Le composant est passé en premier argument. Toute l'inférence de types en découle : aucun alias de type, aucun `satisfies`, aucun import de type.

### 2.2 Cas minimal

Quand toutes les props sont optionnelles :

```ts
export default defineStories(Badge)
```

Une story unique nommée « Par défaut » est générée. Sinon :

```ts
export default defineStories(Badge, {
  stories: { 'Par défaut': { children: 'Nouveau' } },
})
```

### 2.3 Signature

```ts
function defineStories<C>(
  component: C,
  definition?: StoryDefinition<PropsOf<C>, C>
): StoryModule<C>

interface StoryDefinition<P, C> {
  props?: Partial<P>
  stories?: Record<string, Partial<P> | Story<P>>
  wrap?: Wrap<C>
  details?: Partial<Record<keyof P, PropDetails>>
  meta?: StoryMeta
}
```

Une entrée de `wrap` sous forme de tableau est un `WrapEntry`, soit un composant seul, soit un couple composant et props.

**`props`** porte ce qui est commun à toutes les stories. Chaque story ne déclare que ce qui diffère. La fusion est superficielle, prop par prop.

Conséquence à connaître : deux props mutuellement exclusives demandent une remise à zéro explicite. Sur `ProgressLoader`, une story qui passe de `itemLabel` à `criteria` doit écrire `itemLabel: null`. C'est le comportement correct d'une fusion superficielle ; le rendre plus intelligent introduirait de la magie.

**Les clés de `stories`** sont des chaînes libres. Accents, espaces et majuscules sont autorisés. Ce qui est écrit est ce qui s'affiche.

Les props peuvent contenir n'importe quelle valeur JavaScript, y compris des fonctions et des éléments. **Le module de story est importé directement par la preview** : il n'est jamais sérialisé, donc aucune restriction ne s'applique ici (voir section 4.1).

### 2.4 Le helper `story()`

Une story a besoin d'options en plus de ses props (largeur imposée, interaction, réglage de plugin). Le helper les sépare explicitement :

```ts
story(props, options)
```

```ts
'Replié sur mobile': story({ reference: 'REF-4821…' }, { responsive: 'mobile' }),
```

Le second argument est typé par les plugins installés, ce qui donne l'autocomplétion. Le cas courant, sans options, n'utilise jamais ce helper.

### 2.5 `wrap`

`wrap` reconstruit le contexte manquant autour du composant isolé. Quatre formes, de la plus simple à la plus libre :

```ts
wrap: TooltipProvider
wrap: [ThemeProvider, TooltipProvider]
wrap: [[ThemeProvider, { mode: 'dark' }], TooltipProvider]
wrap: (story) => <Foo bar={compute()}>{story}</Foo>
```

Dans la forme tableau, **le premier élément est le plus externe**.

Les trois premières formes sont déclaratives, donc portables : l'adaptateur Vue les interprète sans qu'un caractère du fichier ne change. La forme fonction est spécifique au framework et reçoit l'élément déjà rendu, jamais un composant à instancier.

Le `wrap` global de `crypte.config.ts` enveloppe le `wrap` du fichier, lui-même enveloppant le composant.

`wrap` imbrique, et rien d'autre. Tout ce qui relève du cycle de vie ou de l'observation des props passe par le hook `preview` d'un plugin (section 6).

### 2.6 `meta`

Métadonnées de composant, destinées à l'usage design system :

```ts
meta: {
  status: 'stable',
  owner: 'design-system',
  figma: 'https://figma.com/file/…',
  description: 'Récapitulatif de commande, colonne gauche du checkout.',
}
```

| Champ | Type | Usage |
|---|---|---|
| `status` | `'draft' \| 'stable' \| 'deprecated'` | Badge dans la sidebar, filtrage |
| `owner` | `string` | Affichage, futur routage des commentaires |
| `figma` | `string` | Lien dans le panneau de doc |
| `description` | `string` | Complète le JSDoc du composant |

Tous les champs sont optionnels. Aucun n'est interprété par le noyau : ils sont transportés jusqu'au manifeste et consommés par les plugins.

### 2.7 Composants contrôlés

Un composant contrôlé (`selected` plus `onSelect`, `value` plus `onChange`) n'est pas interactif dans une story : personne ne détient l'état.

**C'est le comportement attendu, pas une limite à contourner.** Dans un atelier de design system, on documente des états, pas des parcours. `Sélectionné` et `Non sélectionné` sont deux stories, chacune avec sa propre baseline visuelle, chacune atteignable par un lien. L'interactivité relève du plugin `interactions`, qui joue un scénario, pas de l'affichage.

Le test du format sur cinq composants réels n'a produit aucun cas où cette réponse ne suffisait pas. Si un cas apparaît, il sera traité alors (section 7).

---

## 3. Détails des props : inférence et fusion

### 3.1 Deux sources

1. **Inférence au build.** Le CLI extrait l'interface de props TypeScript et les commentaires JSDoc associés. Sur un composant correctement typé, cela suffit dans la grande majorité des cas.
2. **Déclaration explicite.** Le champ `details` du fichier de story.

### 3.2 Règle de fusion

**La fusion se fait par prop, et champ par champ.** Une déclaration explicite ne remplace que les champs qu'elle mentionne ; tous les autres restent issus de l'inférence.

C'est la règle qui rend la flexibilité indolore. Une fusion par composant obligerait à tout réécrire dès qu'un seul réglage est nécessaire.

```ts
details: {
  price: { min: 0, max: 500, step: 10 },
}
```

Ici, `price` conserve son type, sa description JSDoc, son caractère requis et sa valeur par défaut issus de l'inférence. Seules les bornes sont ajoutées.

Le champ s'appelle `details` parce qu'il est **complémentaire** : on n'y écrit que ce que l'inférence n'a pas su trouver, jamais la description entière d'une prop.

### 3.3 Structure des détails d'une prop

```ts
interface PluginPropDetails {}

// ce qu'on écrit dans `details`
interface PropDetails extends PluginPropDetails {
  type?: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'function' | 'node' | 'unknown'
  required?: boolean
  default?: unknown
  description?: string
  options?: unknown[]
}

// ce que le manifeste porte, une fois l'inférence faite
interface ResolvedPropDetails extends PropDetails {
  type: PropKind
  required: boolean
}
```

**Le noyau ne décrit que ce qui vaut indépendamment de tout plugin :** la nature d'une prop, son caractère requis, sa valeur par défaut, sa description, ses valeurs possibles. Tout cela sert la documentation, qui existe sans qu'aucun plugin ne soit installé.

`PluginPropDetails` est un point d'extension vide. Un plugin y ajoute ses propres champs depuis son propre paquet, par augmentation de module, sans qu'aucune ligne du noyau ne change :

```ts
declare module '@crypte/core/protocol' {
  interface PluginPropDetails {
    min?: number
    max?: number
    step?: number
    control?: ControlSpec | false // ControlSpec est défini par le plugin, pas par le noyau
  }
}
```

Les bornes d'un curseur et le réglage `control`, qui retire une prop du panneau d'édition sans la retirer de la documentation, relèvent du plugin `controls`. **Ils n'ont aucun sens sans lui**, et le noyau n'a donc pas à les connaître. Sans le plugin installé, les écrire est une erreur de compilation, ce qui est le comportement voulu : personne ne les lirait.

**Un point d'extension vide ne suffit pas à obtenir ce refus.** TypeScript ne signale pas les propriétés excédentaires face à un type qui n'a aucune propriété : tant qu'aucun plugin n'a rien déclaré, un objet quelconque satisfait une interface vide. `PropDetails` échappe au problème parce qu'il hérite de champs du noyau, donc n'est jamais vide. `StoryOptions`, qui n'est fait que du point d'extension, doit l'obtenir explicitement :

```ts
export type StoryOptions = [keyof PluginStoryOptions] extends [never]
  ? Record<string, never>
  : PluginStoryOptions
```

Aucune clé n'est admise tant que le point d'extension est vide, et le contrôle habituel reprend dès qu'un plugin le remplit.

Quand l'inférence échoue (projet sans `tsconfig`, type trop complexe), le type retombe sur `unknown` et la prop reste documentée. **L'échec d'inférence ne doit jamais empêcher le rendu d'une story.**

### 3.4 Props HTML en pass-through

Un composant typé `React.ComponentProps<"span">` ou équivalent hérite de plusieurs centaines d'attributs DOM. C'est le cas de la totalité des composants shadcn.

**Règle : ces props ne sont pas extraites.** Seule `className` l'est, parce qu'elle est utilisée partout. Les autres attributs DOM sont documentés par la plateforme, pas par un design system, et personne ne les consulte dans une table de props.

Une règle, aucun champ supplémentaire, aucune notion de groupe repliable dans le shell.

### 3.5 Limites connues de l'inférence

Certaines constructions ne sont pas résolubles par analyse syntaxique seule et retombent sur la déclaration explicite.

Le cas le plus fréquent est CVA : `VariantProps<typeof badgeVariants>` est un type dérivé d'un appel de fonction à l'exécution. Le résoudre exigerait un vérificateur de types complet, ce qu'Oxc n'est pas. Les options doivent donc être déclarées dans `details.options`.

Une amélioration possible, à traiter dans la PRD du plugin `docs` et non ici : l'objet passé à `cva()` est un objet littéral présent dans le fichier source, donc analysable statiquement.

---

## 4. Manifeste

### 4.1 Rôle

Produit par le CLI, consommé par le shell.

**Le manifeste n'est pas la source du rendu.** La preview importe les modules de stories directement, puisqu'ils appartiennent à son propre bundle Vite. Elle dispose donc des vraies props, fonctions et éléments compris, sans que rien ne traverse le canal.

Le manifeste alimente l'interface du shell : arbre de navigation, recherche, table de props, panneau de controls. Il ne contient que des données sérialisables. Une prop non sérialisable n'y figure pas : `details` suffit à en signaler l'existence et le type.

### 4.2 Entrées typées

Chaque entrée est un `ManifestEntry`, aujourd'hui toujours un `StoryEntry`, et son champ `component` est un `ComponentRef` qui désigne le fichier et l'export d'origine.

Le manifeste est une liste d'entrées portant chacune un champ `type`. **Une seule valeur est implémentée en v1 : `"story"`.** Les valeurs `"page"` et `"tokens"` sont réservées pour les évolutions design system et ne doivent pas être implémentées maintenant.

Cette réserve coûte un champ aujourd'hui et évite une migration plus tard.

```json
{
  "version": 1,
  "entries": [
    {
      "type": "story",
      "id": "checkout/ordersummary--avec-reference",
      "path": ["checkout", "OrderSummary"],
      "name": "Avec référence",
      "component": {
        "name": "OrderSummary",
        "file": "src/components/checkout/OrderSummary.tsx",
        "export": "default"
      },
      "storyFile": "stories/checkout/OrderSummary.ts",
      "options": {},
      "details": { },
      "source": "<OrderSummary reference=\"REF-4821…\" />",
      "meta": { "status": "stable" }
    }
  ]
}
```

### 4.3 Stabilité des identifiants

L'`id` est produit par `storyId`, qui applique `normalizeSegment` au chemin de l'entrée et au nom de la story, passés en minuscules, débarrassés de leurs accents latins et de tout ce qui n'est ni lettre, ni chiffre, ni marque.

**Les marques sont conservées**, et c'est ce qui distingue « Всё » de « Все » : les mêmes signes qui portent un accent latin composent des lettres entières ailleurs. Ne retirer les accents que sur une base latine est donc la règle, pas un détail d'implémentation.

**Il n'est pas garanti ASCII.** Les écritures non latines sont conservées, faute de quoi deux stories russes ou japonaises distinctes tomberaient sur le même identifiant : `storyId(['Button'], 'Активная')` rend `button--активная`. Qui le place dans une URL doit donc l'encoder, et qui en fait un nom de fichier de baseline doit vérifier que le système de fichiers l'accepte. La forme rendue est recomposée en NFC, pour que deux identifiants identiques à l'œil le soient aussi octet à octet.

**C'est une donnée stable, pas un détail d'implémentation.** Il sert d'URL, de clé de baseline pour `visual-tests`, et de référence pour les commentaires. Renommer une story change son `id` et casse sa baseline : ce comportement est assumé et doit être documenté à l'utilisateur, pas contourné.

### 4.4 Champs transportés sans interprétation

`meta`, `options` et `details` sont transportés tels quels du fichier de story jusqu'au manifeste. Le noyau ne les interprète pas : ce sont les plugins qui les consomment. Un plugin peut donc ajouter ses propres clés dans `options` sans modification du noyau.

---

### 4.5 Sérialisation

Le manifeste est écrit en JSON et relu tel quel. **Tout ce qu'il porte doit survivre à cet aller-retour** : pas de fonction, pas d'instance de classe, pas de `Date`, pas d'`undefined` en valeur.

Les types ne l'imposent pas. `default`, `options` et le contenu de `options` d'une entrée sont typés `unknown`, faute de savoir d'avance ce qu'un composant ou un plugin y met. Une fonction y passerait la compilation, puis disparaîtrait à l'écriture sans qu'aucune erreur ne soit levée, `JSON.stringify` retirant silencieusement ce qu'il ne sait pas représenter.

**C'est donc au CLI de garantir ce qu'il écrit**, en omettant ou en représentant autrement ce qui n'est pas sérialisable. Le cas le plus probable est une prop dont la valeur par défaut est une fonction de rappel.

---

## 5. Protocole du canal

### 5.1 Principe

Le shell et la preview ne communiquent que par `postMessage`, avec des messages JSON sérialisables. **Le shell ne peut structurellement pas accéder à React, Vue ou à l'instance du composant.**

Cette contrainte est la garantie d'agnosticisme du noyau. Toute exception introduite ici annulerait l'architecture entière.

La version du protocole est exposée par la constante `PROTOCOL_VERSION`, que la preview annonce dans son message `ready`. Elle est distincte de `MANIFEST_VERSION` : le format du catalogue et celui des messages évoluent séparément.

Le canal ne transporte jamais les props d'une story. Il transporte l'identifiant de l'entrée à rendre, et les **surcharges** issues des controls. Une surcharge est toujours une valeur primitive éditée dans un panneau, donc toujours sérialisable.

### 5.2 Messages du shell vers la preview

| Message | Charge utile | Effet |
|---|---|---|
| `render` | `{ id, overrides }` | Monte l'entrée demandée, `overrides` étant de type `Overrides` |
| `update-overrides` | `{ id, overrides }` | Met à jour sans remonter |
| `set-globals` | `{ globals }` | Applique les réglages globaux |
| déclaré par un plugin | la sienne | Voir `PluginShellMessages` ci-dessous |

### 5.3 Messages de la preview vers le shell

| Message | Charge utile | Effet |
|---|---|---|
| `ready` | `{ protocolVersion }` | La preview est initialisée |
| `rendered` | `{ id, durationMs }` | Rendu terminé |
| `error` | `{ id, message, stack }` | Erreur de rendu, affichée sans casser le shell |
| déclaré par un plugin | la sienne | Voir `PluginPreviewMessages` ci-dessous |

### 5.4 Règles

- Toute charge utile doit survivre à un aller-retour JSON. Pas de fonction, pas d'instance de classe, pas de nœud DOM.
- Une erreur de rendu remonte par `error` et ne doit jamais faire tomber le shell.
- Un plugin déclare ses messages depuis son propre paquet, comme il déclare ses options et ses détails de prop :

```ts
declare module '@crypte/core/protocol' {
  interface PluginShellMessages {
    controls: PluginMessage<{ type: 'controls:open'; open: boolean }>
  }
}
```

Tant qu'aucun plugin n'a rien déclaré, l'union ne s'élargit pas et écrire un message inconnu est une erreur de compilation.

`PluginMessage` porte la contrainte sur son paramètre, si bien qu'un message mal formé produit une erreur **sur la ligne de sa déclaration**, avec le motif en clair. Deux réserves : un plugin n'est pas obligé de l'employer, et `skipLibCheck`, très répandu, fait ignorer les erreurs d'un fichier `.d.ts`. Le protocole ne s'y fie donc pas et filtre de son côté : une valeur dont le champ `type` manque ou n'est pas un littéral est écartée de l'union plutôt que d'y entrer, sans quoi elle empêcherait tout `message.type` de discriminer quoi que ce soit chez le consommateur.

Une version antérieure prévoyait un message générique `{ type: 'plugin', plugin, payload }`, qui n'exigeait rien de sa charge utile et faisait coexister deux mécanismes d'extension dans le même protocole.

---

## 6. Contrat de plugin

### 6.1 Forme

Un plugin est un objet avec au plus trois champs, tous optionnels.

```ts
interface CryptePlugin {
  name: string
  ui?: UIContribution
  preview?: PreviewHooks
  node?: NodeHooks
}
```

| Surface | Exécution | Rôle |
|---|---|---|
| `ui` | Shell, Vue | Panneau, bouton de toolbar |
| `preview` | Iframe | Cycle de vie autour du rendu |
| `node` | CLI | Extension du build, commande |

### 6.2 Règle d'or

**Un hook `preview` ne touche jamais aux internes du framework.** Il reçoit des événements de cycle de vie et un accès au DOM de l'iframe, jamais un arbre React ou une instance Vue.

```ts
interface PreviewHooks {
  beforeMount?(ctx: PreviewContext): void
  afterMount?(ctx: PreviewContext): void
  onPropsChange?(ctx: PreviewContext): void
  beforeUnmount?(ctx: PreviewContext): void
}

interface PreviewContext {
  id: string
  props: Record<string, unknown>
  options: Record<string, unknown>
  root: HTMLElement
  send(payload: unknown): void
}
```

Sans cette règle, chaque plugin devrait être réécrit pour chaque framework, ce qui annulerait tout le bénéfice de l'architecture.

Ce qui exige un contexte de framework (`ThemeProvider`, `QueryClientProvider`) relève de `wrap`, pas d'un plugin.

### 6.3 `ctx.props` est modifiable avant le montage

Dans `beforeMount`, un plugin peut modifier `ctx.props`. C'est le seul moment où les props sont mutables ; ailleurs, le contexte est en lecture seule.

Cette ouverture existe pour un cas précis et démontré : une prop de type fonction non déclarée par l'auteur de la story. `PricingCard` attend `onSelect`, la story ne le fournit pas, le composant reçoit `undefined` et casse au premier clic. Le plugin `actions` remplit ces props avec des fonctions qui journalisent, dans `beforeMount`, en s'appuyant sur `details` pour savoir lesquelles sont des fonctions.

Le noyau ne connaît rien de ce mécanisme. Sans le plugin `actions` installé, l'auteur déclare simplement la fonction lui-même.

### 6.4 Validation du contrat

Le contrat n'est considéré comme stable qu'après avoir été éprouvé par **deux plugins aux besoins opposés** :

- `controls`, qui écrit dans la story.
- `a11y`, qui se contente de la lire.

Tant que ces deux plugins n'existent pas, le contrat reste modifiable sans procédure. Après, tout changement est une rupture.

---

## 7. Hors périmètre

Absents volontairement. Certains relèvent des PRD de projet, d'autres attendent un besoin démontré.

**Relève d'une PRD de projet :**

- Rendu et ergonomie de la sidebar, de la recherche, des panneaux.
- Stratégie de cache et optimisations de démarrage.
- Format de stockage des baselines de `visual-tests`.
- Extraction automatique des options CVA (plugin `docs`).
- API d'écriture de `crypte serve` (commentaires, édition), reportée.

**En réserve, à ajouter si un cas réel le réclame :**

- Entrées de type `page` et `tokens`. Le champ existe déjà, l'implémentation non.
- Échappatoire `render` au niveau d'une story, pour rendre un composant contrôlé réellement interactif. Écartée de la v1 faute de cas démontré (section 2.7). L'ajouter plus tard ne casse rien ; la publier maintenant créerait un usage irrécupérable.
- Documentation des attributs DOM en pass-through (section 3.4).

---

## 8. Journal des versions

**v0.8.** Deux corrections à la v0.7.

| Avant | Après |
|---|---|
| sections 5.2 à 5.4 décrivant le message `plugin` | les points d'extension du canal, comme le reste |
| `Manifest.version: typeof MANIFEST_VERSION` | `number` |

**La partie normative suivait le code d'une version en retard.** Le journal de la v0.7 actait le remplacement du message `plugin`, mais les tableaux du chapitre 5, qui font foi, le décrivaient encore. Qui implémentait le shell depuis ce chapitre écrivait un message que le protocole ne connaît plus.

**Figer la version du manifeste supprimait ce à quoi elle sert.** Le champ existe pour reconnaître un manifeste écrit par une autre version. Lié au littéral courant, la comparaison `manifest.version !== MANIFEST_VERSION` devenait statiquement toujours fausse, et un manifeste v1 relu après passage à v2 n'était typable qu'au prix d'un cast qui affirme le contraire de son contenu.

Aucune migration à prévoir, rien n'est publié.

**v0.7.** Le dossier `protocol` suit trois règles, sans exception.

1. Le nom simple va au côté qu'un humain écrit, le côté produit porte un qualificatif.
2. Tout point d'extension est une interface vide préfixée `Plugin`, augmentée par module.
3. Les imports vont dans un seul sens.

| Avant | Après |
|---|---|
| `PropDetails` (manifeste), `PropDetailsInput` (écrit) | `PropDetails` (écrit), `ResolvedPropDetails` (manifeste) |
| les deux dans `manifest.ts` et `story.ts`, qui s'importaient en rond | `prop.ts`, importé par les deux |
| `EntryMeta` | `StoryMeta` |
| `{ type: 'plugin', plugin, payload }` | `PluginShellMessages`, `PluginPreviewMessages` |
| `PropDetails.name` | retiré, `details` est indexé par nom de prop |
| `Manifest.version: number` | `typeof MANIFEST_VERSION` |

**Le nom.** `PropDetails` désignait ce que le CLI produit, d'où le suffixe `Input` sur ce qu'on écrit, et une dérivation à contresens du flux. Pour savoir ce qu'on pouvait mettre dans `details`, il fallait ouvrir trois fichiers et finir sur une interface vide, d'où l'impression que ces champs venaient tous des plugins. Ils viennent du noyau, sauf quatre.

**Le point d'extension du canal.** Le message `plugin` n'exigeait rien : un plugin y envoyait n'importe quoi. Deux mécanismes d'extension pour le même besoin, dans le même dossier.

**Le champ `name`.** `details` est indexé par nom de prop, donc `name` dupliquait sa clé. C'est pour cette raison qu'on l'ôtait déjà côté écriture.

**Ce qui n'a pas changé, et pourquoi.** `StoryEntry.options` reste ouvert quand `details` est typé. Le motif écrit jusqu'ici était faux : ce n'est pas parce qu'un manifeste peut venir d'un projet aux autres plugins, ce qui vaudrait pour les deux, mais parce que `options` ne contient **que** des réglages de plugins, quand `details` porte `type` et `required`, que le shell lit.

Aucune migration à prévoir, rien n'est publié.

**v0.6.** Deux garanties qui n'étaient pas tenues.

| Avant | Après |
|---|---|
| `ready` annonce `manifestVersion` | `ready` annonce `protocolVersion` |
| `StoryOptions = PluginStoryOptions` | aiguillage qui n'admet aucune clé tant que le point d'extension est vide |

**Le nom du champ du message.** Il transportait déjà la version du protocole du canal, pas celle du manifeste, que la preview ne connaît d'ailleurs pas au moment où elle se déclare prête. Tant que les deux valaient 1, l'écart était invisible ; au premier changement de format du manifeste, le shell aurait affiché une version pour l'autre sans qu'aucun des deux côtés ne détecte l'incompatibilité.

**Le refus des clés inconnues.** La v0.5 annonçait qu'écrire une option sans le plugin qui la lit était une erreur de compilation. Ce n'était vrai que pour `PropDetails`, qui hérite de champs du noyau. Pour `StoryOptions`, fait du seul point d'extension, TypeScript ne contrôlait rien : une interface vide accepte n'importe quel objet. Voir la section 3.3 pour la forme retenue.

Aucune migration à prévoir, rien n'est publié.

**v0.5.** Le noyau ne connaît plus aucun plugin.

Deux changements, un de nom et un de structure.

| Avant | Après |
|---|---|
| champ `controls` d'un fichier de stories | champ `details` |
| champ `argTypes` du manifeste | champ `details` |
| `ArgType` | `PropDetails` |
| `ControlOverride` | `PropDetailsInput` |
| `ArgType.control`, `ControlSpec` | sortis du noyau, apportés par le plugin |

**Le nom.** `controls` et `argTypes` désignaient la même chose sous deux noms, l'un hérité du plugin qui la consomme, l'autre d'un vocabulaire extérieur. Or ce champ décrit des props, et il le fait **partiellement** : on n'y écrit que ce que l'inférence n'a pas trouvé. `details` dit les deux, et il est le même des deux côtés, à l'écriture comme dans le manifeste.

**La structure.** `control` et les bornes n'ont de sens qu'avec le plugin `controls` installé, et le noyau les déclarait pourtant. Un plugin devait donc modifier le noyau pour ajouter un réglage, ce que la section 4.4 interdit explicitement pour `options`. Ils passent par `PluginPropDetails`, un point d'extension vide que chaque plugin remplit depuis son propre paquet.

Conséquence voulue : sans le plugin, écrire une borne est une erreur de compilation. Personne ne la lirait.

Aucune migration à prévoir, rien n'est publié.

**v0.4.** Nommage des paquets.

Le nom nu `crypte` est refusé par npm : le filtre anti-typosquatting le juge trop proche de `crypto` et `bcrypt`. Le refus est définitif et vaut pour tout le monde. Le scope `@crypte` est en revanche acquis, et il portait déjà l'essentiel du projet.

| Avant | Après |
|---|---|
| `crypte` (binaire et API) | `@crypte/cli` (binaire et `defineConfig`) |
| `import … from 'crypte'` | `import … from '@crypte/react'` |

Section 1.4 ajoutée, sections suivantes renumérotées. Aucun contrat n'est modifié.

**v0.3.** Simplification, après réexamen des ajouts de la v0.2.

| Retiré | Raison |
|---|---|
| Marqueur `{ "$fn": … }` et substitution associée | Résolvait un problème inexistant : la preview importe les modules de stories, les props ne traversent pas le canal |
| Champ `group` sur `ArgType` | Un champ générique pour un seul usage. Les props DOM ne sont simplement pas extraites |
| Échappatoire `render` | Aucun cas démontré sur les cinq composants testés. Mise en réserve |

| Ajouté | Effet |
|---|---|
| `ctx.props` modifiable dans `beforeMount` | Une ligne au contrat de plugin, remplace le mécanisme retiré |
| Message `render` en `{ id, overrides }` | Décrit honnêtement ce qui circule |
| Section 4.1 clarifiée | Le manifeste alimente le shell, il n'est pas la source du rendu |

Bilan : deux sections supprimées, un champ supprimé, un concept supprimé du manifeste.

**v0.2.** Intégration des six corrections issues du test du format sur cinq composants d'un projet React réel. Trois d'entre elles sont retirées ou remplacées en v0.3.

**v0.1.** Version initiale, quatre contrats.
