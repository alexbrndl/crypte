# Crypte, pistes issues de l'exploration d'interface

> Propositions, rien n'est arbitré. Ce fichier existe pour que les décisions prises en dessinant le shell ne se perdent pas entre deux lots. Il ne fait pas foi : `spec-contrats.md` fait foi, et `suivi.md` porte les points de revue arbitrés, ce qui n'est pas le cas d'ici.
>
> Chaque piste dit ce qu'elle coûte. L'ordre va du moins cher au plus cher à l'intérieur de chaque section.

---

## 1. Ce qui touche aux contrats

Ces quatre points modifient `spec-contrats.md`. Aucun n'est rétrocompatible par accident : trois sont additifs, le dernier ne l'est pas.

### 1.1 `UIContribution` prend une forme

La section 6 déclare `ui?: UIContribution` sans jamais définir `UIContribution`. Proposition :

- Deux zones nommées, `toolbar` et `panel`, toutes deux optionnelles.
- L'ordre d'affichage est l'ordre de `plugins` dans `crypte.config.ts`. Pas de champ `order`, que chaque plugin réglerait à zéro.
- L'état d'ouverture est persisté par le shell sous la clé du plugin, jamais par le plugin.

*Ce qui casse sans ça :* deux plugins réels ne peuvent pas cohabiter sans que le shell invente une règle au cas par cas, et cette règle deviendra un contrat implicite qu'on ne pourra plus changer.

### 1.2 Un plugin déclare ses commandes en même temps que son panneau

La palette de commandes indexe les stories et les actions. Une action de plugin doit donc être déclarative : un libellé, un raccourci facultatif, une fonction. Même section que ci-dessus, même point d'extension.

*Coût :* un champ de plus sur `UIContribution`.

### 1.3 Un panneau doit pouvoir dire qu'il n'a rien à dire, et pourquoi

Le shell déplie les panneaux qui portent une information et laisse les autres sur une ligne, en bas, avec la raison écrite. Cette règle n'est pas implémentable si le panneau est une boîte noire : il faut soit qu'il rende un silence typé, soit que le shell l'interroge avant de le rendre.

*Pourquoi ça compte :* c'est la réponse au seul problème d'ergonomie que la concurrence n'a pas résolu, l'encombrement des panneaux quand il y en a sept. Leur piste actuelle est un réglage de configuration de plus.

### 1.4 Neutraliser une entrée de `wrap` depuis le shell

`wrap` empile des providers. Pouvoir en désactiver un à la fois révèle de quel contexte un composant dépend en silence, ce qui est un mode de panne fréquent en design system et que personne ne diagnostique.

*Coût :* c'est le seul point de cette liste qui touche le canal. Il faut un message du shell vers la preview, et l'adaptateur doit savoir sauter une entrée. Section 5 de la spec, plus les deux adaptateurs.

*Recommandation :* ne pas le faire avant que l'adaptateur Vue existe. C'est lui qui prouvera que le mécanisme est portable, et c'est le seul moment où le prix sera justifié.

---

## 2. Ce qui relève du CLI

### 2.1 Le manifeste porte les props propres à chaque story

Aujourd'hui une entrée porte `details`, qui décrit la surface de props du composant, mais rien ne dit quelles props **cette story** pose explicitement. Il manque une liste de noms par entrée.

Trois choses en dépendent : la couverture de props, la colonne « props propres » de la page composant, et la recherche par prop.

*Coût :* un champ additif, donc pas de changement de `MANIFEST_VERSION`. Le CLI le connaît déjà au moment où il écrit l'entrée.

### 2.2 Le poids de chaque plugin est mesuré au build

Le shell affiche ce que chaque plugin installé coûte en kilo-octets. C'est l'argument de vente rendu tangible, et le seul chiffre sur lequel l'utilisateur peut agir. Il faut que quelqu'un le mesure : c'est le build.

### 2.3 Détection de renommage

Renommer une story change son identifiant et casse sa baseline. C'est assumé et documenté, mais aujourd'hui « documenté » veut dire « écrit dans un paragraphe que personne ne lit au bon moment ».

Heuristique proposée : un identifiant disparaît, un autre apparaît, le `component` et la `source` sont identiques, alors c'est un renommage. Le shell le dit et propose de reprendre la baseline.

*Attention :* c'est une heuristique, elle se trompera. Elle doit donc proposer, jamais agir seule.

---

## 3. Versionner les manifestes

L'idée : garder l'historique des manifestes dans le projet de l'utilisateur, et pouvoir en charger plusieurs pour comparer. Elle nourrit l'écran « ce qui a changé » et donne à `comments` un point d'ancrage stable.

### 3.1 Mesures

Manifeste synthétique aux entrées variées, calqué sur le corpus réel, huit props documentées en moyenne par composant.

| Stories | Brut | gzip |
| -- | -- | -- |
| 23 | 24 Ko | 3,8 Ko |
| 100 | 113 Ko | 13,5 Ko |
| 500 | 556 Ko | 62 Ko |
| 2000 | 2,2 Mo | 242 Ko |

Soit environ 1,1 Ko par story en brut. Conserver l'historique complet, une copie entière par version :

| Versions, projet à 500 stories | Poids cumulé, gzip |
| -- | -- |
| 20 | 1,2 Mo |
| 100 | 6,0 Mo |
| 500 | 30 Mo |
| 2000 | 120 Mo |

**Conclusion : garder des copies entières ne tient pas.** Au-delà d'une cinquantaine de versions le dossier devient plus lourd que le code qu'il décrit.

En ne gardant que ce qui change d'une version à l'autre, sur une hypothèse de deux pour cent d'entrées modifiées par build, une version coûte 2,2 Ko au lieu de 62 Ko, et deux mille versions tiennent dans 4,2 Mo. Le delta est donc la seule forme viable.

*Réserve sur la mesure :* le générateur pioche dans un vocabulaire restreint, donc les chiffres brotli qu'il produit sont trop optimistes et je ne les reporte pas. Les chiffres gzip et bruts sont, eux, conservateurs.

### 3.2 Ce que je propose plutôt

Ne pas écrire de format d'historique. Git en est déjà un, et il fait de la compression par delta mieux qu'on ne la ferait.

Deux fichiers plutôt qu'un :

- **Le manifeste complet**, produit à chaque build, ignoré par Git. C'est un artefact, il n'a pas à être versionné.
- **Une empreinte réduite**, commitée. Par entrée : l'identifiant, le fichier et l'export du composant, le statut, la liste triée des noms de props, et une empreinte du reste. Mesuré : 189 octets par story, soit 92 Ko brut et 6 Ko gzip pour cinq cents stories, et surtout un fichier qui **ne change que quand quelque chose de significatif change**.

Trois conséquences qui valent la peine :

1. L'historique est celui du dépôt. Charger une version, c'est lire un commit, et la comparaison entre deux versions est une comparaison entre deux commits.
2. Un renommage se voit dans un diff Git avant même que le shell en parle.
3. `comments` obtient ce qui lui manquait : un commentaire s'ancre sur un identifiant **et** une empreinte, donc on sait si le commentaire porte encore sur la même chose.

### 3.3 Qui écrit l'empreinte

Elle suit le régime d'un fichier de verrouillage, et pour la même raison : ce qui dépend de la discipline de l'utilisateur finit par ne pas être fait.

- Le build écrit l'empreinte, sans qu'on la demande.
- L'intégration continue échoue si l'empreinte commitée ne correspond pas à celle que le build produit, avec le message qui dit quoi lancer.

La crainte de salir les diffs ne tient pas : l'empreinte est construite pour ne changer que quand quelque chose de significatif change. Ce qui apparaît dans le diff est donc exactement ce qu'une revue veut voir.

### 3.4 La frise d'un composant

L'empreinte versionnée donne mieux qu'une comparaison entre deux états : une frise par composant, où se rangent tous les événements qui le concernent. Version où une prop est apparue, passage de `draft` à `stable`, commentaire déposé, baseline reprise, story ajoutée ou retirée.

Ce qui ordonne la frise est la **version**, pas la date. La date n'est qu'un repère de lecture, et elle est facultative : deux builds du même jour se distinguent par leur empreinte, pas par leur horodatage.

C'est aussi ce qui donne un foyer à `comments`, qui n'en avait aucun : un commentaire est un événement de la frise, ancré sur un identifiant et une empreinte.

---

## 4. Plugins à ajouter au catalogue

À reporter dans `plugins.md`.

| Paquet | Rôle | Surfaces | Phase |
| -- | -- | -- | -- |
| `@crypte/coverage` | Props déclarées jamais exercées par une story, et usage réel des composants dans le code applicatif | node, ui | 3 |
| `@crypte/diff` | Comparaison de deux stories d'un même composant, côte à côte, avec les props qui diffèrent | ui |  Plus tard |

`coverage` fait deux choses. Sans rien scanner, il croise `details` et les props propres de chaque story pour dire ce qui n'est documenté nulle part. En prolongeant le parcours que `crypte check` fait déjà pour trouver les composants sans story, il compte les usages réels dans l'application. Le second point justifie à lui seul que ce soit un plugin : le noyau n'a aucune raison de savoir lire le code applicatif.

`diff` monte deux previews à la demande, ce qui est très différent d'en monter sept par défaut. Il partage sa mécanique avec `grid`, et devrait sortir après lui.

---

## 5. Décisions d'interface prises en dessinant

Elles relèvent de la PRD du shell, pas des contrats, mais elles ont été tranchées et méritent d'être écrites.

| Décision | Motif |
| -- | -- |
| Aucune option de disposition | La concurrence expose neuf réglages d'interface pour éviter d'avoir décidé. Une seule disposition, deux raccourcis pour replier les colonnes. |
| Les panneaux se déplient selon ce qu'ils ont à dire | Voir 1.3. Aucun panneau grisé, aucun panneau vide silencieux. |
| Pas de temps de rendu par story | Six millisecondes contre cinq ne veut rien dire. Seule la valeur aberrante est signalée, et le chiffre qui compte est le démarrage. |
| Le statut vit sur le composant, pas sur la story | `meta` est déclaré par fichier de stories, donc il porte sur le composant. Le badge et le filtre suivent. |
| L'arbre a trois niveaux, pas deux | Une entrée porte `path` et `name`, donc dossier, composant, story. |
| L'identifiant va dans un paramètre de requête | Un segment de chemin oblige à réécrire vers `index.html`, ce qu'un serveur de fichiers statique ne fait pas. |
| Copier le lien est une action de premier plan | C'est ce qu'on colle dans une pull request. Elle ne mérite pas une icône discrète. |

---

## 6. Ce qui reste ouvert

**La question la plus coûteuse à retarder :** le shell a-t-il un écran « composant » en plus de l'écran « story » ?

Elle commande quatre choses à la fois. Si `path` est un simple préfixe d'arbre ou une entité de première classe. Où s'affichent `meta.status`, `owner` et `description`, qui n'ont aujourd'hui aucun endroit où exister. Si l'URL a un ou deux niveaux. Et si `grid`, `docs`, `coverage` et `comments` se brancheront sur une surface existante ou devront chacun en inventer une.

Elle coûte une décision aujourd'hui, et une migration d'URL plus une surface publique de plus si elle est prise après publication.

---

## 7. Note d'entretien

`test-format-stories.md` est classé « historique » dans `arborescence.md`, mais le document lui-même ne le dit pas. Il prescrit encore le marqueur `$fn`, retiré en v0.3, et un groupe repliable « Attributs HTML », remplacé en 3.4 par la règle qui ne les extrait pas. Qui implémente depuis ce fichier implémente une version périmée : il gagnerait un avertissement en tête.
