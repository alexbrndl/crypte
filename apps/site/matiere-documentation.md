# Matière pour la documentation du site

Extrait de `docs/internal/comprendre.md`, supprimé du dépôt public le 23 septembre 2026.
Ce que l'utilisateur de Crypte a besoin de lire, et qui n'avait pas sa place dans
un commentaire de code.

## `crypte init` refuse plutôt que d'écrire une configuration qui ne chargerait pas

_1. Le produit. Ce que la commande fait quand aucun framework n'est reconnu, et la liste des adaptateurs qu'elle imprime alors. `guide.md` ne décrit aujourd'hui que l'autre refus, celui d'écraser une configuration existante ; un utilisateur sans React tombe sur une erreur que rien n'annonce._

`init` lit `package.json`, reconnaît le framework, écrit les deux clés requises de la section 1.5 des contrats, rien d'autre. Sans framework reconnu il n'écrit rien et nomme les adaptateurs qui existent : une configuration dont `adapter` est vide échoue une commande plus tard, en nommant un fichier que l'utilisateur n'a pas écrit. Cette commande n'a pas de section de contrat à elle, parce que le fichier qu'elle écrit est la section 1.5. Les autres raisons vivent en commentaire dans `packages/cli/src/init.ts`.

_Rouvre si : un second adaptateur apparaît et la reconnaissance devient un vrai choix, ou une mesure montre que les conseils imprimés ne sont pas lus._

## Un fichier illisible est signalé et sauté, jamais fatal

_2. La lecture des stories. L'utilisateur voit un fichier absent du catalogue avec une raison ; il doit savoir que c'est volontaire, que le reste du catalogue tient, et que le message nomme la limite du lecteur et non sa faute. Le mécanisme lui-même (trois réponses plutôt qu'un booléen, le `never` de `produced`) est déjà commenté dans `stories.ts`._

La règle vaut pour toute cause, pas seulement une erreur de syntaxe : sinon une story en cours d'écriture coûte le catalogue entier. `readStories` rend `StoriesRead`, dont la variante `unusable` porte la raison, et un seul endroit décide. « Ce fichier déclare-t-il des stories ? » admet oui, non, et je ne sais pas lire ; écrasée dans un booléen, la troisième tomberait du côté « non », celui qui invente une entrée que personne n'a écrite. Les deux niveaux, `skipped` par fichier et `partial` par entrée, sont écrits en 4.1 de `docs/contracts.md`. Le producteur rend la raison, l'appelant la dit : un catalogue qui avale ses erreurs ressemble à un projet sans stories. Le message nomme la limite de l'outil, jamais l'erreur de l'auteur, parce que l'illisible est le plus souvent du JavaScript légitime que le guide encourage, `props: { ...baseProps, title }` en tête.

_Rouvre si : un lecteur qui exécuterait le fichier, où il ne resterait que des erreurs et où le niveau intermédiaire disparaîtrait._

## Rien n'est inventé, chaque nom écarté est compté

_2. La lecture des stories. Règle d'écriture : quelles formes le lecteur écarte (spread, clé calculée, appel d'une autre fonction que le helper) et le fait qu'il les compte plutôt que de les deviner. Le code le dit déjà sur `readStories` et `unreadOf`, l'utilisateur ne le lira pas là._

Un spread, une clé calculée, l'appel d'une fonction qui n'est pas le helper : le nom est laissé de côté. Le helper est reconnu par sa liaison d'import et non par son nom, donc `import { story as s }` est suivi et `make({ a: 1 })` n'est pas pris pour lui. Un faux nom de prop entre dans un chiffre de couverture et dans la recherche par prop, donc il ment sans se signaler, alors qu'un nom manquant se voit. Pour une clé de story c'est pire : elle devient une URL, une clé de baseline visuelle et l'ancre d'un commentaire. Chaque clé écartée remonte dans la raison du fichier.

## Un spread remplace ce qui le précède

_2. La lecture des stories. Un utilisateur qui écrit `{ stories: …, ...base }` perd ses stories sans le savoir. La règle du dernier gagnant appartient au guide d'écriture des stories ; `shadowed` la porte déjà entièrement pour le lecteur du code._

Le dernier gagne : `{ stories: écrite, ...base }` rend celle de `base`, l'inverse rend celle qui est écrite. `shadowed(objet, nom)` répond à la question, et une clé absente rendant `-1`, tout spread est alors « après » elle, ce qui est le bon verdict. La règle vaut pour chaque clé de la définition et un cran plus bas dans le bloc `stories`. Une clé écrite deux fois suit la même logique, sans qu'aucun spread ne prévienne.

## `props`, et au plus `options`, désigne une story

_2. La lecture des stories. C'est le contrat d'écriture d'une story, et le piège associé : un composant dont les props sont exactement `props` et `options` est lu de travers. `asStoryLiteral` le dit déjà au développeur du CLI, pas à l'auteur de stories._

Un objet qui déclare `props`, et au plus `options`, est lu comme un `Story` ; sinon comme des props. Un composant dont les props sont exactement `props` et `options` est donc lu de travers, et aucune autre lecture n'est possible sans exécuter le fichier. Le repli sur `Default` n'existe que pour un fichier qui ne nomme aucune story, et la définition doit en plus être un littéral sans spread : sinon `stories: {}` ou `defineStories(A, { ...base })` redonnent une entrée fantôme, avec un identifiant qui devient une URL et une clé de baseline.

## Le bandeau ne porte que trois cas certains

_2. La lecture des stories. L'utilisateur voit le bandeau et doit savoir quels trois cas y mènent, et que le terminal en dit davantage. La moitié interne (`wasStory` dans la session, le renommage insensible à la casse) est déjà commentée dans `manifest.ts`._

Le terminal garde tout fichier du dossier des stories qui ne produit rien. Le bandeau est une interface permanente, donc il se limite à trois cas certains : un appel à `defineStories` que l'export par défaut ne porte pas, un fichier qui ne parse pas, un fichier qui produisait des stories et n'en produit plus. Deviner l'intention depuis l'export par défaut a un contre-exemple par règle, `memo(Frame)` et `forwardRef(…)` étant des appels. L'appel se lit au niveau du module et sous le nom local de l'import ; une fabrique n'en est pas un. `wasStory` vit dans la session et non dans le manifeste, que le fichier quitte dès le bandeau posé ; il s'oublie quand le fichier n'est pas de la passe, jamais parce que `existsSync` le dit absent, un système de fichiers insensible à la casse laissant l'ancienne graphie exister après un renommage.

## Le périmètre de « composant sans story » vient des imports

_2. La lecture des stories. L'utilisateur de `crypte check` doit savoir pourquoi un dossier qu'aucune story n'atteint n'est jamais signalé, et qu'aucune racine ne se déclare en configuration. `componentFolders` le dit déjà avec sa raison._

La configuration ne déclare aucune racine de composants : le périmètre est l'ensemble des dossiers des composants que les stories citent. Un dossier qu'aucune story n'atteint est donc invisible, et c'est voulu, parcourir tout le projet produisant le flot de faux avertissements que le contrat interdit. Une racine en configuration créerait une seconde source de vérité, qui diverge des imports.

_Rouvre si : un usage réel demande d'avertir sur un dossier qu'aucune story n'atteint._

## 3. Le manifeste

## Le format du manifeste est publié, la forme Storybook est un export

_3. Le manifeste. Un utilisateur qui veut lire `.crypte/manifest.json` depuis son propre outil a besoin de savoir que le format est publié et versionné par `MANIFEST_VERSION`. Rien à protéger dans le code : `protocol/manifest.ts:12-14` garde déjà le champ `version`, et l'export Storybook (`crypte build`, `index.json`, `iframe.html?id=`) n'existe nulle part dans le dépôt, la CLI n'ayant que `dev`, `check` et `init`._

Le format est publié, documenté et versionné : on demande à d'autres outils de le lire, donc `MANIFEST_VERSION` est un contrat et non un numéro interne. `crypte build` peut écrire un `index.json` à la forme de Storybook et servir un `iframe.html?id=`. C'est un export étiqueté compatibilité, jamais le format de Crypte : si Storybook casse son format, on casse un export et pas une identité.

_Rouvre si : un consommateur réimplémente le producteur plutôt que le lecteur, le seul cas où un format ouvert coûte plus qu'il ne rapporte._

## Deux granularités de rechargement

_4. Le serveur de développement. Comportement que l'utilisateur voit tous les jours : éditer un composant ou des props met à jour à chaud sans remonter l'arbre, ajouter ou renommer un fichier de story recharge la preview. Il en a besoin pour savoir si ce qu'il observe est normal._

Éditer un composant ou les props d'une story ne demande rien au serveur : l'entrée générée accepte le module et rejoue le dernier rendu. Sans ce chemin, Vite ne trouve personne pour accepter et recharge le cadre entier. Ajouter, retirer ou renommer un fichier de story invalide le module virtuel et recharge la preview. `shape()` décide, en comparant l'identifiant, le nom, le chemin, le fichier, `skipped` et `partial` de chaque entrée, jamais le manifeste entier. Sans ces deux derniers champs, une story cassée ou des props perdues ne se voient qu'après un rechargement à la main. Changer la valeur d'une prop ne touche pas la forme, donc la mise à jour à chaud reste une mise à jour à chaud.

## Le serveur a son propre cache de dépendances

_4. Le serveur de développement. Un dossier `node_modules/.crypte` apparaît chez l'utilisateur ; il cherchera ce que c'est et s'il peut le vider. Le commentaire de `viteConfigOf` dit déjà pourquoi il est séparé, mais il n'est pas lu par un utilisateur._

Il pré-optimise dans `node_modules/.crypte`, et non dans le `node_modules/.vite` du `vite dev` du projet : deux serveurs aux plugins et aux entrées différents y écriraient le même fichier de métadonnées.

## Un changement de `crypte.config.ts` reconstruit tout le serveur

_4. Le serveur de développement. Seule la moitié « ce que contient `.crypte/` » : `manifest.json` est un artefact ignoré par Git, `fingerprint.json` se commite. C'est une décision que l'utilisateur doit prendre dans son dépôt, pas dans le nôtre._

`server.restart()` de Vite ne suffit pas : la configuration est lue par `loadProject`, hors de Vite, et le plugin de service capture le projet. Le serveur neuf est construit avant que l'ancien ne ferme, donc une configuration à moitié écrite lève sans faire tomber celui qui tourne, et le port passe de l'un à l'autre sans trou. Le port repris est celui du serveur qui tourne, jamais le défaut cherché à nouveau, sinon un serveur bouge sous l'onglet ouvert. Un changement se reconnaît au contenu des fichiers surveillés, pas à l'événement : une sauvegarde en émet plusieurs, et un éditeur touche la date d'un fichier qu'il n'a pas changé. Les redémarrages sont mis en file plutôt que gardés par un drapeau, ce qui n'en perd aucun.

Le manifeste sur disque, ignoré par Git, est réécrit après la bascule seulement : plus tôt, un redémarrage qui n'aboutit pas laisse un fichier décrivant un catalogue que personne ne sert. L'empreinte est commitée et ne s'écrit qu'au premier démarrage : la réécrire salirait l'arbre de travail pendant que l'auteur essaie un chemin de stories. Un redémarrage redit tout ce que dit un démarrage, fichiers écartés compris, sauf ce que le serveur d'avant avait déjà annoncé.

## Crypte n'ajoute aucun plugin Vite pour React

_4. Le serveur de développement. Un projet React qui veut `@vitejs/plugin-react` doit le déclarer lui-même dans `vite.plugins`, et Fast Refresh n'y sert à rien puisque la preview recharge l'iframe entière. Un utilisateur qui ne le sait pas croit à une panne._

`@crypte/react` livre l'adaptateur et les helpers de story, pas de plugin, et le CLI n'en ajoute aucun : un projet qui veut `@vitejs/plugin-react` le déclare dans `vite.plugins`. Vite transforme déjà le JSX par oxc ; ce que le plugin ajoute est Fast Refresh, dont la preview ne se sert pas, le shell étant un bundle préconstruit sans client HMR et l'iframe se rechargeant entière. Ne pas l'injecter quand `adapter.name` vaut `react` : c'est deviner un nom de paquet, et un adaptateur enveloppé casse la devinette.

_Rouvre si : le shell est servi par Vite avec HMR, ou Vite cesse de transformer le JSX._

## L'entrée de preview est générée depuis le texte de `crypte.config.ts`

_5. La preview. Tout le mécanisme est déjà gardé en commentaire (en-tête de `config-source.ts`, `compiled` et le contrôle `wrap` de `serve.ts`). Ce qui reste est une règle d'écriture que l'utilisateur subit : `adapter` et `wrap` s'écrivent en place ou s'importent, jamais calculés, jamais derrière un spread, et un import doit rester sous la racine du projet. Les trois refus sortent des messages d'erreur ; une page les explique une fois au lieu de laisser chacun les découvrir._

Le CLI sert un module virtuel qui recopie les expressions `adapter` et `wrap` de la configuration, lues comme du texte. Il n'importe jamais ce fichier : la section 1.5 des contrats y autorise `vite: { plugins: [react()] }`, et un plugin Vite chargé dans le navigateur réclame `node:module`. L'adaptateur vient du champ, jamais d'un nom déduit de `adapter.name`, qui casse dès qu'on enveloppe un adaptateur. Un `wrap` que la configuration exécutée porte mais que son texte ne montre pas, derrière un spread par exemple, fait lever l'entrée au lieu de monter la story sans son contexte. Les noms sont lus dans l'arbre et non dans le texte : sinon `createAdapter({ runtime: 'react' })` fait retenir l'import du plugin React, précisément ce que lire au lieu d'exécuter évite. L'entrée porte donc le TypeScript de l'auteur, que `transformWithOxc` retire dans le hook `load` ; renommer le module virtuel en `.ts` n'y suffit pas, Vite ne le transforme pas pour autant. Le nom donné à oxc est `crypte-preview.ts` dans la racine du projet, pour que le `tsconfig.json` du projet s'applique, et la configuration résolue et le veilleur lui sont passés, sinon oxc garde un cache de `tsconfig` que Vite a déjà vidé.

## Le shell est préconstruit, la preview est compilée dans le projet

_6. Le shell. Le mécanisme est déjà écrit quatre fois dans le code (serve.ts l. 30-32 et l. 94-103, apps/shell/vite.config.ts, App.vue l. 7-8, copy-shell.mjs l. 1), donc personne ne le supprimera par erreur. Reste la conséquence pour l'utilisateur : la preview appartient à son bundle, c'est ce qui permet à une story de passer une fonction ou un élément en prop sans sérialisation._

Le shell ne connaît aucun framework : il lit un manifeste et parle par le canal. Il est donc construit à l'avance et copié dans `packages/cli/dist` au pack. La preview, elle, importe l'adaptateur installé et les modules de stories : elle appartient au bundle et au framework de l'utilisateur, et c'est ce qui permet à une story de passer une fonction ou un élément en prop.

_Rouvre si : le shell a besoin d'un composant fourni par un framework, ou l'utilisateur doit pouvoir le remplacer._

## La sélection retombe sur le même rang dans le même fichier

_6. Le shell. recover.ts explique déjà le repli à chaque garde (l. 32-33, 49-52, 54-56), donc rien à sauver côté code. Mais le comportement est visible à l'usage : renommer une story change son identifiant, et Crypte retombe sur la story au même rang dans le même fichier, sur rien si le fichier entier a disparu. Un utilisateur qui renomme doit savoir ça._

L'identifiant vient du chemin et du nom : un renommage le change, et le même rang désigne alors la story renommée. Retomber sur la première story du fichier enverrait sur « Par défaut » quelqu'un qui renommait « Avertissement ». Fichier disparu, rien n'est sélectionné : une story d'ailleurs enverrait sur un composant que personne n'a ouvert.

## 7. Les plugins

## Trois plugins par défaut, et une liste nommée ne donne que ce qu'elle nomme

_7. Les plugins. Quels plugins tournent sans configuration, et le fait qu'un champ `plugins` défini les remplace au lieu de s'y ajouter : c'est de la documentation de configuration, lue avant d'écrire `crypte.config.ts`. Rien ne l'implémente : `manifest.ts:191` lit `config.plugins ?? []` sans préréglage, `packages/cli/package.json` ne déclare aucun plugin en dépendance, et `docs` n'existe pas encore. Au passage, le commentaire d'`entriesOf` dans `packages/tokens/src/index.ts` affirme « this plugin is on by default » : c'est faux aujourd'hui, à corriger dans le même passage._

`docs`, `controls` et `tokens` sont actifs quand aucune configuration ne dit le contraire. Le CLI les déclare en dépendances et les active : le CLI dépend des plugins, le core jamais. Un champ `plugins` défini donne exactement ce qu'il liste et rien de plus, pour que personne n'ait à se demander d'où sort un plugin qu'il n'a pas écrit.

_Rouvre si : un plugin du préréglage assez lourd au démarrage pour se sentir, ou assez souvent faux pour que le couper devienne le geste normal._

## Un plugin sans rien à dire rend `inapplicable`

_7. Les plugins. Contrat d'auteur de plugin : ce qu'il rend quand il n'a rien à dire sur une story, et le fait qu'on ne voit ni section vide ni message « rien trouvé ». Aucun code ne porte le mot, `docs/contracts.md` ne le mentionne nulle part, donc il n'y a aucune ancre où le coller. La page d'écriture de plugins est sa place._

L'état est une valeur à deux branches, par rendu : soit un corps, soit `inapplicable` avec sa raison. Jamais les deux, jamais une raison seule ; un booléen plus une raison optionnelle laisserait écrire les deux formes illégales. Par rendu et non déclaré une fois, parce qu'un plugin peut n'avoir rien à dire sur une story et beaucoup sur la suivante. Conséquence pour les plugins par défaut : ni section vide, ni message « rien trouvé ». L'identifiant est `inapplicable` partout où il se tape, code, `UIContribution` et maquette Figma ; la prose française dit « sans objet », et il n'y a pas de troisième mot. Seul « silence » comme nom de cet état est écarté : ailleurs dans le dépôt le mot désigne un défaut qui ne se signale pas, et ces emplois-là restent.

_Rouvre si : un framework ou un langage de conception qui possède déjà `inapplicable` pour autre chose, une seconde surface où le mot ne se lit pas, ou un meilleur nom trouvé en construisant la bibliothèque d'interface ; les deux orthographes bougent alors ensemble._

## L'état de référence Figma vit dans les `$extensions` du fichier DTCG

_7. Les plugins. Le fichier DTCG appartient à l'utilisateur, qui y verra des `$extensions` à ne pas retirer et doit savoir ce que leur absence signifie. Aucun code DTCG ni Figma dans ce dépôt : la page de synchronisation Figma est sa place._

Les identifiants de variables Figma sont gardés dans les `$extensions` du fichier DTCG lui-même, pas dans un fichier de référence à côté. Une variable présente dans Figma et absente du code aurait sinon deux histoires possibles, ajoutée côté design ou supprimée côté code, identiques vues de face et appelant des actions opposées. Un identifiant qui n'existe plus dans Figma veut dire supprimé côté design ; pas d'identifiant veut dire nouveau côté code.

_Rouvre si : un consommateur DTCG qui refuse les `$extensions` inconnues, ce que la spécification autorise._

## Aucun appel sortant depuis le CLI

_9. La publication. C'est une promesse publique, pas un mécanisme : rien dans le code ne l'implémente, donc aucun commentaire ne peut la garder. Elle est tenue aujourd'hui par `README.md` (« No telemetry in the CLI. Not now, not later. »). Si le README quitte le dépôt, la promesse doit réapparaître sur le site, sinon un texte publié disparaît sans décision._

Le CLI n'émet pas de télémétrie, et aucun paquet de Crypte n'appelle le réseau. Le README le promet publiquement, donc un appel sortant ajouté ici démentirait un texte publié.
