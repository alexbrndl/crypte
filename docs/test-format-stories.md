# Crypte, test du format sur cinq composants réels

> Exercice préalable à toute implémentation. Cinq fichiers de stories écrits à la main contre des composants du projet de référence existants, sans une ligne de code Crypte. Objectif : trouver les frictions tant que les corriger coûte zéro.

**Résultat : le format tient sur quatre composants sur cinq. Six corrections à apporter à la spécification, dont une bloquante.**

---

## 1. Les cinq fichiers

### 1.1 `stories/ui/Badge.ts`

Composant shadcn, censé être le cas trivial. Il ne l'est pas.

```ts
import { defineStories } from '@crypte/react'
import { Badge } from '@/components/ui/badge'

export default defineStories(Badge, {
  meta: { status: 'stable', owner: 'design-system' },
  props: { children: 'Nouveau' },
  details: {
    variant: {
      options: [
        'default', 'secondary', 'destructive', 'outline', 'ghost', 'link',
        'primary-alternate', 'positive', 'warning', 'info',
      ],
    },
  },
  stories: {
    'Par défaut': {},
    'Secondaire': { variant: 'secondary' },
    'Contour': { variant: 'outline' },
    'Positive': { variant: 'positive', children: 'Vérifié' },
    'Avertissement': { variant: 'warning', children: 'À vérifier' },
    'Destructive': { variant: 'destructive', children: 'Sinistre déclaré' },
    'Information': { variant: 'info', children: '3 rapports' },
  },
})
```

### 1.2 `stories/checkout/OrderSummary.ts`

Le cas nominal. Aucune friction : props explicites, JSDoc riche, aucune dépendance externe.

```ts
import { defineStories, story } from '@crypte/react'
import OrderSummary from '@/components/checkout/OrderSummary'

export default defineStories(OrderSummary, {
  meta: { status: 'stable', owner: 'funnel' },
  props: {
    bannerLabel: 'Votre commande est confirmée !',
    title: 'Formule Complète + 2 modules',
    benefits: [
      'Historique complet',
      'Données vérifiées',
      'Incidents déclarés',
      'Rapports de contrôle',
    ],
  },
  stories: {
    'Par défaut': {},
    'Avec référence': { reference: 'REF-4821-KD' },
    'Depuis une annonce': {
      sourceUrl: 'https://marketplace.example.com/l/2891234567',
      sourceLabel: 'marketplace.example.com/l/2891234567',
    },
    'Profil Profil': { profileLabel: 'Profil standard, budget 25 000 €' },
    'Sans bénéfices': { benefits: [] },
    'Replié sur mobile': story(
      { reference: 'REF-4821-KD' },
      { responsive: 'mobile' },
    ),
  },
})
```

`Replié sur mobile` est la story qui justifie le plugin `responsive` : le composant a deux arbres complets séparés par `lg:flex` et `lg:hidden`, invérifiables sans changer la largeur.

### 1.3 `stories/checkout/ProgressLoader.ts`

Le meilleur argument commercial du projet. Ces états sont impossibles à obtenir dans l'app sans intercepter le polling.

```ts
import { defineStories } from '@crypte/react'
import ProgressLoader from '@/components/checkout/ProgressLoader'
import { loaderTranslations } from '@/fixtures/loader'

const vehicle = 'Modèle Atlas 400 · 2021'

export default defineStories(ProgressLoader, {
  meta: {
    status: 'stable',
    owner: 'funnel',
    description:
      "États intermédiaires impossibles à reproduire dans l'application sans intercepter le polling.",
  },
  props: { translations: loaderTranslations, progress: 0, itemLabel: vehicle },
  details: { progress: { min: 0, max: 100, step: 1 } },
  stories: {
    'Démarrage': { progress: 0 },
    'Étape 2': { progress: 30 },
    'Étape 3': { progress: 55 },
    'Dernière étape': { progress: 90 },
    'Import externe': {
      progress: 50,
      itemLabel: null,
      sourceUrl: 'https://marketplace.example.com/l/2891234567',
    },
    'Profil': {
      progress: 45,
      itemLabel: null,
      criteria: ['Budget : 23 000 €', 'Standard', 'Option A', '5 unités'],
    },
    'Sans récapitulatif': { progress: 20, itemLabel: null },
  },
})
```

Le control borné sur `progress` transforme les sept stories en un curseur continu. C'est la démonstration à faire aux développeurs sceptiques.

### 1.4 `stories/checkout/PricingCard.ts`

Le composant qui casse le format. Voir section 2.3.

```ts
import { defineStories } from '@crypte/react'
import PricingCard from '@/components/checkout/PricingCard'
import { planBasic, planPro } from '@/fixtures/plans'

export default defineStories(PricingCard, {
  meta: { status: 'stable', owner: 'funnel' },
  props: {
    plan: planPro,
    selected: false,
    features: ['2 rapports inclus', 'Analyses illimitées', 'Support prioritaire'],
  },
  stories: {
    'Non sélectionné': {},
    'Sélectionné': { selected: true },
    'Le plus populaire': { popularLabel: 'Le plus choisi' },
    'Offre essentielle': { plan: planBasic },
    'Sans bénéfices': { features: [] },
  },
})
```

`onSelect` n'est pas déclaré : il doit être fourni automatiquement (correction 1). `selected` reste statique, la carte n'est pas cliquable (correction 3).

### 1.5 `stories/ui/Tabs.tsx`

Composant shadcn composé, écrit en `.tsx` parce que les sous-composants imposent du JSX.

```tsx
import { defineStories } from '@crypte/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default defineStories(Tabs, {
  meta: { status: 'stable', owner: 'design-system' },
  props: {
    defaultValue: 'card',
    children: (
      <>
        <TabsList>
          <TabsTrigger value="card">Carte bancaire</TabsTrigger>
          <TabsTrigger value="paypal">PayPal</TabsTrigger>
        </TabsList>
        <TabsContent value="card">Formulaire carte</TabsContent>
        <TabsContent value="paypal">Redirection PayPal</TabsContent>
      </>
    ),
  },
  stories: {
    'Par défaut': {},
    'PayPal actif': { defaultValue: 'paypal' },
  },
})
```

Aucune friction sur le format, mais la conséquence est notable : dès qu'un composant attend des enfants structurés, le fichier passe en `.tsx`. C'est acceptable et cohérent avec la spécification, à condition de le documenter clairement.

---

## 2. Les frictions

### 2.1 Bloquant : les props de type fonction ne sont pas sérialisables

`PricingCard` attend `onSelect: (planId: string) => void`. Le manifeste étant du JSON, une fonction ne peut pas y figurer. Le protocole du canal impose la même contrainte.

**Correction.** Une prop détectée comme fonction n'est pas sérialisée mais remplacée par un marqueur :

```json
"onSelect": { "$fn": "onSelect" }
```

La preview substitue une fonction réelle au moment du montage. Cette fonction émet un message `plugin` que `actions` affiche. Trois bénéfices : le manifeste reste du JSON pur, l'auteur de la story n'écrit jamais de `noop`, et le journal des événements fonctionne sans configuration.

Un `noop` explicite dans `props` reste possible et prend le pas sur la substitution.

**Impact :** section 4 et section 5 de la spécification.

### 2.2 Les props HTML en pass-through noient le panneau

`Badge` est typé `React.ComponentProps<"span"> & VariantProps<…>`. L'inférence remonterait plusieurs centaines d'attributs DOM, rendant le panneau et la table de props inutilisables.

**Correction.** L'extraction reconnaît les types de props DOM et les regroupe dans une entrée unique repliée, « Attributs HTML », séparée des props propres au composant. Le regroupement se fait à l'extraction, pas à l'affichage : le manifeste ne doit pas transporter trois cents entrées inutiles.

**Impact :** section 3 de la spécification.

### 2.3 Les composants contrôlés ne sont pas interactifs

`PricingCard` reçoit `selected` et `onSelect` : c'est un composant contrôlé. Dans une story, cliquer ne produit rien, puisque personne ne détient l'état.

Deux réponses, et je penche pour la première.

**Réponse produit.** Dans un atelier de design system, montrer les deux états statiques est la bonne pratique. `Sélectionné` et `Non sélectionné` sont deux stories, chacune avec sa baseline visuelle. L'interactivité relève du plugin `interactions`, pas de l'affichage. Cette réponse ne coûte rien.

**Échappatoire, pour les cas où elle manque vraiment.** Une clé `render` au niveau de la story, spécifique au framework :

```tsx
'Interactif': story({ plan: planPro }, {
  render: (props) => {
    const [selected, setSelected] = useState(false)
    return <PricingCard {...props} selected={selected} onSelect={() => setSelected(!selected)} />
  },
})
```

À documenter comme rare et à réserver aux cas réels. C'est le seul endroit où le format laisse fuir des spécificités de framework, et il faut l'assumer explicitement : une story qui utilise `render` renonce à la génération automatique du code source.

**Impact :** section 2 de la spécification, avec un avertissement clair.

### 2.4 Les énumérations CVA ne sont pas inférables statiquement

`variant` provient de `VariantProps<typeof badgeVariants>`, un type dérivé d'un appel `cva()` à l'exécution. Le résoudre demande un vérificateur de types complet, pas un analyseur syntaxique. Oxc parse, il ne type-check pas.

**Correction.** Deux niveaux. Par défaut, la déclaration manuelle dans `controls.options`, comme dans le fichier `Badge.ts` ci-dessus. Ce qui valide au passage la décision de supporter les deux sources.

Mieux : le plugin `docs` peut lire statiquement l'objet littéral passé à `cva()` et en extraire les clés de `variants`. C'est un objet littéral dans le fichier source, donc parfaitement analysable. Comme shadcn est très répandu, le retour sur investissement est bon, et ça reste dans un plugin, hors du noyau.

**Impact :** aucun sur la spécification. À noter dans la PRD du plugin `docs`.

### 2.5 Les props objet demandent des fixtures

`PricingCard` attend un `PlanData` de dix-neuf champs, `ProgressLoader` un objet de traductions imbriqué. Les écrire dans chaque story serait illisible.

**Bonne nouvelle :** un dossier de fixtures existe souvent déjà dans un projet réel. Les stories l'importent, exactement comme le fait le code applicatif.

**Correction.** Aucune sur le format. À documenter comme convention : les données volumineuses vivent dans des fixtures partagées, pas dans les fichiers de stories. Si `fixtures/` ne couvre pas encore les plans et les traductions de loader, ce sont deux petits fichiers à ajouter côté projet.

### 2.6 `crypte check` risque de produire du bruit

`ProgressLoader.tsx` exporte `stepFromProgress`, une fonction utilitaire. Le contrôle « composant sans story » la signalerait à tort.

**Correction.** Le contrôle ne s'applique qu'aux exports identifiés comme composants : nom en capitale initiale et retour de type élément. En cas de doute, ne rien signaler. Un avertissement faux coûte plus cher qu'un oubli.

**Impact :** section 1.2 de la spécification.

---

## 3. Verdict sur le format

Sur les quatre décisions structurantes, trois sont confirmées sans réserve.

**Le modèle plat tient.** Aucun des cinq fichiers n'aurait gagné à un modèle à deux niveaux. `ProgressLoader` le confirme même par l'absurde : ses sept états ne sont pas des variantes d'un même cas, ce sont sept cas distincts qui méritent chacun leur baseline.

**Les noms en chaînes de caractères valent leur poids.** « Sans période d'essai », « Le plus populaire », « Étape 2 » : aucun n'aurait survécu à la contrainte d'identifiant JavaScript sans un champ `name` de correction.

**La fusion par prop est validée deux fois.** Sur `Badge`, on déclare uniquement `options` et le reste vient de l'inférence. Sur `ProgressLoader`, uniquement les bornes de `progress`. Une fusion par composant aurait obligé à tout réécrire dans les deux cas.

**`props` commun plus surcharge par story fonctionne**, à une nuance près visible sur `ProgressLoader` : passer de `itemLabel` à `criteria` demande de remettre explicitement `itemLabel: null`. C'est le comportement correct d'une fusion superficielle, et le rendre plus intelligent serait de la magie. À documenter, pas à corriger.

---

## 4. Suite

Six corrections à reporter dans `docs/spec-contrats.md`, dont une seule touche à la structure du manifeste et du protocole : le marqueur de fonction.

Deux fichiers de fixtures à ajouter côté projet, dans `src/fixtures/` : les plans tarifaires et les traductions de loader.

Un point à explorer avant le P0 : `src/pages/ui-kit` existe déjà. C'est vraisemblablement la vitrine manuelle actuelle, donc à la fois ce que Crypte remplace et une source d'exemples déjà écrits. À regarder avant d'attaquer l'implémentation.
