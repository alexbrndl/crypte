# Comprendre Crypte

Ce fichier est le seul du dépôt à expliquer **comment le projet marche et pourquoi**. La spécification, elle, vit dans [`contracts.md`](../contracts.md), qui fait foi sur les formats, le manifeste, le protocole et les plugins.

Il ne porte que ce dont l’oubli ferait défaire un mécanisme par erreur. Pas de récit, pas de chiffre qui périme, pas de numéro d’issue. Chaque sujet a un titre court qu’un commentaire de code peut citer, et les décisions portent la ligne qui les rouvrirait.

## 1. Le produit

### Trois commandes : `dev`, `check`, `init`

`crypte dev` lit le projet, écrit le catalogue, sert le shell et la preview, et les suit pendant que les fichiers changent. `crypte check` signale deux problèmes, et seulement eux : un composant sans story, une story orpheline. `crypte init` écrit la configuration de départ.

### `crypte init` refuse plutôt que d'écrire une configuration qui ne chargerait pas

`init` lit `package.json`, reconnaît le framework, écrit les deux clés requises de la section 1.5 des contrats, rien d'autre. Sans framework reconnu il n'écrit rien et nomme les adaptateurs qui existent : une configuration dont `adapter` est vide échoue une commande plus tard, en nommant un fichier que l'utilisateur n'a pas écrit. Cette commande n'a pas de section de contrat à elle, parce que le fichier qu'elle écrit est la section 1.5. Les autres raisons vivent en commentaire dans `packages/cli/src/init.ts`.

_Rouvre si : un second adaptateur apparaît et la reconnaissance devient un vrai choix, ou une mesure montre que les conseils imprimés ne sont pas lus._

### Un orphelin n'est signalé que si le projet pouvait atteindre le composant

Une story dont `component.file` ne désigne rien sur le disque est orpheline quand l'identifiant est un chemin relatif, ou un alias que le projet déclare. Un identifiant nu qui ne correspond à aucun alias est laissé tranquille : le producteur résout sans Vite, donc un composant atteint par un plugin ou par un champ `exports` garde l'identifiant écrit dans la story, et rien ne le distingue d'un composant supprimé. Le signaler ferait échouer la commande sur un projet correct, ce que la section 1.2 refuse. `check` ne résout pas via Vite : le producteur est fait pour tourner avant qu'un serveur existe.

_Rouvre si : le manifeste gagne un champ disant si `componentFile` a résolu, et la devinette disparaît entièrement._

### La génération de stories lit les appels, pas les signatures

La skill part des composants sans story que `crypte check` liste déjà, regarde les sites d'appel réels dans l'application, et propose les cas qu'elle y trouve. Elle n'énumère pas des combinaisons de props : ça rend un dossier de stories que personne n'a choisies. L'inférence donne la surface, la story donne le cas : elle saura qu'une prop `progress` va de 0 à 100, jamais que 30 mérite d'exister et s'appelle « Étape 2 ». L'humain garde, jette, et nomme.

_Rouvre si : les sites d'appel se révèlent moins informatifs que les types, signe de composants de présentation pure sans cycle de vie à décrire._

### `page` arrive en deux temps

Premier temps : du markdown du dépôt, découvert comme les stories et rendu à côté des composants, sans serveur. Second temps : les mêmes fichiers édités par des designers et renvoyés en pull request, ce qui demande `crypte serve`. Traiter `page` comme un seul morceau est ce qui le faisait paraître cher et lointain.

### L'export Storybook est un export, jamais notre format

Le manifeste est publié, l'`index.json` de Storybook reste une sortie de compatibilité. La règle « ne couvrir que ce que l'usage démontre » est muette ici, et seulement ici : personne ne peut réclamer cette compatibilité tant que personne n'utilise Crypte. À la place, un déclencheur écrit : le premier utilisateur qui fait déjà tourner un outil lisant l'`index.json` de Storybook.

## 2. La lecture des stories

### Une story est lue, jamais exécutée

Le fichier est analysé avec `parseSync`, que `vite` réexporte et qui est le parseur d'Oxc : aucune dépendance ajoutée, `vite` étant déjà déclarée par `@crypte/cli`. Ne pas le remplacer par `parseAst`, exporté lui aussi : il ne lit que du JavaScript et échoue sur `as const` comme sur une flèche générique en `.tsx`. `parseSync` reçoit le nom du fichier, donc le langage vient de l'extension, et il rend ses erreurs au lieu de les lancer. Rien n'est exécuté : les valeurs de props ne sont pas résolues, et le manifeste ne les transporte pas, la preview important les modules elle-même.

_Rouvre si : un besoin exige la valeur exécutée d'une prop, ou Vite retire `parseSync` de ses exports publics._

### Lire un fichier et parcourir le dossier sont deux modules

`stories.ts` n'a besoin que du texte d'un fichier. `manifest.ts` parcourt le dossier, résout les composants et écrit, ce qui demande le projet. Un fichier de story se teste donc sans monter un projet.

### Un fichier illisible est signalé et sauté, jamais fatal

La règle vaut pour toute cause, pas seulement une erreur de syntaxe : sinon une story en cours d'écriture coûte le catalogue entier. `readStories` rend `StoriesRead`, dont la variante `unusable` porte la raison, et un seul endroit décide. « Ce fichier déclare-t-il des stories ? » admet oui, non, et je ne sais pas lire ; écrasée dans un booléen, la troisième tomberait du côté « non », celui qui invente une entrée que personne n'a écrite. Les deux niveaux, `skipped` par fichier et `partial` par entrée, sont écrits en 4.1 de `docs/contracts.md`. Le producteur rend la raison, l'appelant la dit : un catalogue qui avale ses erreurs ressemble à un projet sans stories. Le message nomme la limite de l'outil, jamais l'erreur de l'auteur, parce que l'illisible est le plus souvent du JavaScript légitime que le guide encourage, `props: { ...baseProps, title }` en tête.

_Rouvre si : un lecteur qui exécuterait le fichier, où il ne resterait que des erreurs et où le niveau intermédiaire disparaîtrait._

### Rien n'est inventé, chaque nom écarté est compté

Un spread, une clé calculée, l'appel d'une fonction qui n'est pas le helper : le nom est laissé de côté. Le helper est reconnu par sa liaison d'import et non par son nom, donc `import { story as s }` est suivi et `make({ a: 1 })` n'est pas pris pour lui. Un faux nom de prop entre dans un chiffre de couverture et dans la recherche par prop, donc il ment sans se signaler, alors qu'un nom manquant se voit. Pour une clé de story c'est pire : elle devient une URL, une clé de baseline visuelle et l'ancre d'un commentaire. Chaque clé écartée remonte dans la raison du fichier.

### Un spread remplace ce qui le précède

Le dernier gagne : `{ stories: écrite, ...base }` rend celle de `base`, l'inverse rend celle qui est écrite. `shadowed(objet, nom)` répond à la question, et une clé absente rendant `-1`, tout spread est alors « après » elle, ce qui est le bon verdict. La règle vaut pour chaque clé de la définition et un cran plus bas dans le bloc `stories`. Une clé écrite deux fois suit la même logique, sans qu'aucun spread ne prévienne.

### `props`, et au plus `options`, désigne une story

Un objet qui déclare `props`, et au plus `options`, est lu comme un `Story` ; sinon comme des props. Un composant dont les props sont exactement `props` et `options` est donc lu de travers, et aucune autre lecture n'est possible sans exécuter le fichier. Le repli sur `Default` n'existe que pour un fichier qui ne nomme aucune story, et la définition doit en plus être un littéral sans spread : sinon `stories: {}` ou `defineStories(A, { ...base })` redonnent une entrée fantôme, avec un identifiant qui devient une URL et une clé de baseline.

### Le bandeau ne porte que trois cas certains

Le terminal garde tout fichier du dossier des stories qui ne produit rien. Le bandeau est une interface permanente, donc il se limite à trois cas certains : un appel à `defineStories` que l'export par défaut ne porte pas, un fichier qui ne parse pas, un fichier qui produisait des stories et n'en produit plus. Deviner l'intention depuis l'export par défaut a un contre-exemple par règle, `memo(Frame)` et `forwardRef(…)` étant des appels. L'appel se lit au niveau du module et sous le nom local de l'import ; une fabrique n'en est pas un. `wasStory` vit dans la session et non dans le manifeste, que le fichier quitte dès le bandeau posé ; il s'oublie quand le fichier n'est pas de la passe, jamais parce que `existsSync` le dit absent, un système de fichiers insensible à la casse laissant l'ancienne graphie exister après un renommage.

### L'extraction des props vit dans le CLI, pas dans un plugin

`packages/cli/src/props.ts` lit le fichier du composant avec oxc, sans l'exécuter, et remplit `details` ; `manifest.ts` l'appelle une fois par fichier de story, puis complète avec ce que la story a écrit. `controls` et `docs` liront tous deux ces données : calculée par deux plugins, elle donnerait deux réponses sur le même composant. L'affichage, lui, reste dehors. Deux sources dans l'ordre : les membres du type des props quand le fichier le porte, sinon les noms du motif de déstructuration du paramètre. Aucun import, générique, intersection ni `extends` n'est suivi : les résoudre demanderait un vérificateur de types, et un nom qu'on n'a pas lu serait un faux nom dans un chiffre de couverture.

_Rouvre si : les types de props d'un projet vivent dans un fichier partagé, ou un adaptateur livre ce que son framework sait déjà._

### Vite charge `crypte.config.ts`

`loadConfigFromFile`, fonction publique de Vite, transpile le fichier TypeScript et rend en prime la liste des fichiers dont la configuration dépend, ce qui sert à les surveiller. Le CLI a Vite en dépendance de toute façon.

_Rouvre si : le CLI cesse de dépendre de Vite._

### Les chemins du projet passent par un plugin, jamais par `resolve.alias`

Un alias réécrit sans condition, là où TypeScript essaie la cible puis retombe sur la résolution normale quand elle n'existe pas. Sans ce repli, un motif large détourne des imports qui ne lui appartiennent pas : traduire `@*` intercepte `@vee/runtime-core` et plus aucun paquet scopé ne résout. Le motif au plus long préfixe fixe gagne, un motif sans joker passe devant, et un seul est retenu : ses cibles épuisées on retombe sur Vite, jamais sur un autre motif, qui ferait résoudre ici ce que l'éditeur du développeur déclare introuvable. `this.resolve` finit le travail et applique extensions, `index` et `exports`. La correspondance de motifs est éprouvée seule, car de l'extérieur une capture fautive est invisible : le repli renvoie l'import à Vite comme si rien ne s'était passé.

_Rouvre si : `resolve.alias` gagne un mode de repli._

### Le périmètre de « composant sans story » vient des imports

La configuration ne déclare aucune racine de composants : le périmètre est l'ensemble des dossiers des composants que les stories citent. Un dossier qu'aucune story n'atteint est donc invisible, et c'est voulu, parcourir tout le projet produisant le flot de faux avertissements que le contrat interdit. Une racine en configuration créerait une seconde source de vérité, qui diverge des imports.

_Rouvre si : un usage réel demande d'avertir sur un dossier qu'aucune story n'atteint._

## 3. Le manifeste

### Le manifeste est un produit de build, l'empreinte est commitée

`.crypte/manifest.json` est régénéré à chaque build et ignoré par Git. `.crypte/fingerprint.json`, sa forme réduite, est commitée sous régime de fichier de verrouillage : le build l'écrit, la CI échoue quand la version commitée ne correspond pas. Ne pas la retirer. C'est la seule chose du dépôt qui rend un changement de catalogue visible dans un diff de pull request, et un relecteur ne lance jamais de build. Trois écrans en dépendent : ce qui a changé, la chronologie d'un composant, l'ancre stable des commentaires. Le manifeste complet ne peut pas tenir ce rôle, il change à chaque build même quand rien de significatif n'a bougé. Lequel fait foi est en 4.6 de `docs/contracts.md`. Verrue connue : réordonner un bloc de props change la source, donc l'empreinte, pour un rendu identique.

*Rouvre si : l'empreinte d'un projet bouge à chaque build, ce qui voudrait dire que la forme réduite retient quelque chose qu'elle ne devrait pas. Ou si quelqu'un nomme la solution plus simple.*

### Le format du manifeste est publié, la forme Storybook est un export

Le format est publié, documenté et versionné : on demande à d'autres outils de le lire, donc `MANIFEST_VERSION` est un contrat et non un numéro interne. `crypte build` peut écrire un `index.json` à la forme de Storybook et servir un `iframe.html?id=`. C'est un export étiqueté compatibilité, jamais le format de Crypte : si Storybook casse son format, on casse un export et pas une identité.

*Rouvre si : un consommateur réimplémente le producteur plutôt que le lecteur, le seul cas où un format ouvert coûte plus qu'il ne rapporte.*

### `component.file` est résolu sans Vite, sur l'ordre partagé

Le producteur tourne avant qu'un serveur existe : il applique les motifs du projet et essaie les extensions usuelles, sans plugin ni champ `exports`. L'ordre des motifs est exporté et partagé avec le plugin de résolution, sinon un composant résout d'une façon pour la preview et d'une autre pour le catalogue. L'ordre des extensions reprend le défaut de `resolve.extensions`, `.vue` en queue parce qu'il nous appartient, et chaque fichier est essayé avant tout `index`, sinon `Card/index.tsx` gagne contre `Card.js`. Sur un projet portant `Card.ts` et `Card.js` côte à côte, cas courant quand une sortie de build voisine sa source, un autre ordre fait importer un fichier à la preview et écrire l'autre au catalogue. Quand rien ne répond, l'identifiant écrit par la story est rendu tel quel : un chemin inventé ferait ouvrir un fichier qui n'existe pas.

### Deux stories sur le même identifiant arrêtent la construction

`storyId` replie la casse et les accents, donc « Avec référence » et « avec reference » rendent la même chaîne. Cet identifiant est une URL, une clé de baseline visuelle et l'ancre d'un commentaire. Trancher en silence perdrait une story et écraserait plus tard une baseline. Le message nomme les deux fichiers et les deux noms.

### Le type `tokens` est au protocole, la lecture des formats au plugin

Le type d'entrée `tokens` vit dans le protocole, la découverte et la lecture des formats vivent dans `@crypte/tokens`. Dans le core, chaque nouveau format deviendrait une release du core, et la liste des formats ne fera que grandir. C'est la ligne que suit déjà l'extraction des props : produire la donnée contre l'afficher. Le plugin a deux surfaces et pas une, parce que `getComputedStyle` est la seule façon de lire une valeur juste en clair comme en sombre, et qu'un hook `node` tourne avant qu'un navigateur existe.

*Rouvre si : un projet dont les tokens ne se lisent pas sans lancer son build, ce que le premier principe refuse.*

### Un élément illisible fait tomber tout le tableau

Dans un objet, une valeur que JSON ne sait pas porter fait tomber sa seule clé ; dans un tableau elle fait tomber le tableau entier. Sauter l'élément décalerait tous les suivants, ce qui change la donnée au lieu de la perdre. La garantie de sérialisation est en 4.5 de `docs/contracts.md`, cette asymétrie non.

### Le tri rend l'empreinte reproductible

`readdirSync` n'a pas d'ordre propre, donc le dossier est parcouru trié à chaque niveau. Le condensé, lui, trie les clés à toute profondeur, parce que `JSON.stringify` garde l'ordre d'insertion. Sans l'un ou sans l'autre, deux machines écrivent deux empreintes différentes pour le même catalogue, et le verrou rougit sur un changement qui n'en est pas un.

### Ce que le condensé garde de chaque story

`component` et `meta` sont montrés en partie, `fichier#export` et le statut, et repliés en entier dans le condensé : sinon un champ ajouté à `ComponentRef` ne se verrait nulle part. La liste des champs montrés ne nomme donc que ce qui est intégralement montré. Une story sans `meta` reçoit le statut `none`, sinon lui ajouter `status: 'draft'` ne changerait pas l'empreinte, alors que c'est ce qu'elle sert à suivre. Les props viennent de l'entrée et jamais de `details` : `details` est la surface du composant, `props` ce que cette story pose. Le tri des props ici est une défense et non la garantie du producteur, cette fonction acceptant n'importe quel manifeste, y compris écrit ailleurs.

### `test/manifest-size.mjs` est la source des chiffres, pas un test

Il fabrique des manifestes synthétiques et affiche ce qu'ils pèsent, bruts et compressés. Il n'assertionne rien et ne tourne pas en intégration continue : il existe parce que la décision de ne pas commiter le manifeste complet repose sur ses chiffres, et sans lui cette décision devient une opinion. Graine fixe, sinon deux lancements ne se comparent pas. Vocabulaires séparés jusqu'à l'intérieur d'une entrée, sinon gzip écrase la redondance et la mesure ne vaut rien. Gzip seul en sortie : sur un vocabulaire aussi restreint, brotli annonçait un gain qui n'était pas crédible.

*Rouvre si : un changement du format du manifeste, qui demande de remesurer.*

## 4. Le serveur de développement

### Le serveur est en `appType: 'custom'`, le shell est servi par `sirv`

Le défaut `spa` réécrit toute URL inconnue vers `index.html` : la page de preview et la route du manifeste recevaient la page du shell. Une fois nos routes réclamées, `custom` protège encore d'autre chose : tout vrai projet a son propre `index.html`, et `spa` la sert pour n'importe quelle faute de frappe là où l'utilisateur attendait un 404. La fixture et le projet de démonstration en portent une pour l'éprouver. Le bundle du shell est servi par `sirv` sur le dossier copié, enregistré en premier : Vite est enraciné dans le projet et répondait 404.

### Le catalogue est lu à chaque requête, remplacé à chaque reconstruction réussie

Le plugin de service reçoit une fonction, pas une valeur : capturé au démarrage, il laisserait le shell et l'entrée de la preview sur l'arbre du démarrage. Le catalogue retenu n'est remplacé qu'après une reconstruction réussie. Deux stories partagent brièvement un nom pendant qu'on convertit un fichier, le contrôle d'unicité lève, et garder le catalogue d'avant est la différence entre une sauvegarde qui clignote et un serveur qui s'arrête. Rendre la main avant le remplacement servait les props d'avant l'édition.

### Deux granularités de rechargement

Éditer un composant ou les props d'une story ne demande rien au serveur : l'entrée générée accepte le module et rejoue le dernier rendu. Sans ce chemin, Vite ne trouve personne pour accepter et recharge le cadre entier. Ajouter, retirer ou renommer un fichier de story invalide le module virtuel et recharge la preview. `shape()` décide, en comparant l'identifiant, le nom, le chemin, le fichier, `skipped` et `partial` de chaque entrée, jamais le manifeste entier. Sans ces deux derniers champs, une story cassée ou des props perdues ne se voient qu'après un rechargement à la main. Changer la valeur d'une prop ne touche pas la forme, donc la mise à jour à chaud reste une mise à jour à chaud.

### Un fichier écarté est dit une fois

Un fichier de story que le lecteur cesse de lire disparaît de l'arbre, et une reconstruction qui lève fige l'arbre : sans une ligne imprimée, l'auteur ne sait pas pourquoi. La liste des lignes déjà dites est tenue à part du catalogue, qui ne peut pas servir de mémoire : un fichier écarté ne change pas la forme, donc la même ligne repartait à chaque frappe. Elle est amorcée par ce que le démarrage a imprimé, puis remplacée à chaque reconstruction, jamais grossie : gardée pour toujours, un fichier cassé puis réparé puis recassé ne dirait plus rien la seconde fois.

### La surveillance des stories est la nôtre, pas celle de Vite

Vite ne surveille que les fichiers de son graphe de modules : un fichier de story qu'aucune page n'a encore demandé n'y figure pas, et ses modifications n'arrivaient jamais. Sur macOS le trou est invisible, le système surveillant le dossier entier ; sur Linux, les ajouts et les suppressions arrivaient, les modifications non. Un `fs.watch` récursif sur le dossier des stories suffit ; tout événement étant déjà à l'intérieur, il n'y a ni filtre de chemin ni résolution de lien symbolique. Une sauvegarde produit plusieurs événements, d'où un court regroupement.

### Les fichiers de composant sont surveillés un par un

Les détails de props sont lus dans le fichier du composant, qui vit hors du dossier des stories : sans surveillance, éditer un commentaire de documentation laissait une table de props fausse jusqu'à ce qu'un fichier de story bouge. Un par un et non un dossier récursif : un composant vit n'importe où et l'ancêtre commun est souvent la racine du projet. Le jeu est comparé par chemin à chaque reconstruction plutôt que refermé et rouvert, sinon les surveillants s'accumulent pour la durée du serveur. Un fichier absent est sauté : un composant atteint par un plugin garde un identifiant irrésolu. `fs.watch` sur un fichier suit l'inode, donc la sauvegarde atomique des éditeurs le tue et le surveillant se rouvre sur `rename` ; sans cela le composant est muet jusqu'au redémarrage. Le test lit le jeu surveillé directement : observer ses effets rend vert un cas dont le mécanisme a été retiré, macOS couvrant par accident les voisins d'un fichier surveillé.

### Le serveur a son propre cache de dépendances

Il pré-optimise dans `node_modules/.crypte`, et non dans le `node_modules/.vite` du `vite dev` du projet : deux serveurs aux plugins et aux entrées différents y écriraient le même fichier de métadonnées.

### Un changement de `crypte.config.ts` reconstruit tout le serveur

`server.restart()` de Vite ne suffit pas : la configuration est lue par `loadProject`, hors de Vite, et le plugin de service capture le projet. Le serveur neuf est construit avant que l'ancien ne ferme, donc une configuration à moitié écrite lève sans faire tomber celui qui tourne, et le port passe de l'un à l'autre sans trou. Le port repris est celui du serveur qui tourne, jamais le défaut cherché à nouveau, sinon un serveur bouge sous l'onglet ouvert. Un changement se reconnaît au contenu des fichiers surveillés, pas à l'événement : une sauvegarde en émet plusieurs, et un éditeur touche la date d'un fichier qu'il n'a pas changé. Les redémarrages sont mis en file plutôt que gardés par un drapeau, ce qui n'en perd aucun.

Le manifeste sur disque, ignoré par Git, est réécrit après la bascule seulement : plus tôt, un redémarrage qui n'aboutit pas laisse un fichier décrivant un catalogue que personne ne sert. L'empreinte est commitée et ne s'écrit qu'au premier démarrage : la réécrire salirait l'arbre de travail pendant que l'auteur essaie un chemin de stories. Un redémarrage redit tout ce que dit un démarrage, fichiers écartés compris, sauf ce que le serveur d'avant avait déjà annoncé.

### Fermer un serveur

Vite résout la fermeture d'un serveur qui n'a jamais écouté sans émettre `'close'` : les veilleurs accrochés à cet événement survivent, chaque jeu fuité double les redémarrages suivants et le processus ne se termine plus. `startDev` remonte donc de quoi les fermer explicitement, et la poignée n'est vidée que si la fermeture a réussi, sinon on jette le seul moyen de fermer un serveur encore debout sur son port. `close()` désarme et attend la file : désarmer seul laisse un redémarrage déjà commencé gagner la course. Un drapeau ferme aussi la temporisation et la reconstruction des surveillants, faute de quoi une temporisation armée juste avant la fermeture rouvre un surveillant par composant sur une carte vidée.

### Les imports de `crypte.config.ts` sont réécrits absolus depuis la racine

L'entrée générée est un module virtuel : `./src/components/Frame` s'y résoudrait contre son propre chemin et échouerait. Un import qui sort du projet est refusé en le nommant.

### Crypte n'ajoute aucun plugin Vite pour React

`@crypte/react` livre l'adaptateur et les helpers de story, pas de plugin, et le CLI n'en ajoute aucun : un projet qui veut `@vitejs/plugin-react` le déclare dans `vite.plugins`. Vite transforme déjà le JSX par oxc ; ce que le plugin ajoute est Fast Refresh, dont la preview ne se sert pas, le shell étant un bundle préconstruit sans client HMR et l'iframe se rechargeant entière. Ne pas l'injecter quand `adapter.name` vaut `react` : c'est deviner un nom de paquet, et un adaptateur enveloppé casse la devinette.

*Rouvre si : le shell est servi par Vite avec HMR, ou Vite cesse de transformer le JSX.*

### MCP pour les agents, HTTP et l'API GitHub pour le plugin

Les agents ont un serveur MCP local en stdio qui lit le manifeste, sans réseau ni rien à héberger. Le plugin Figma passe par HTTP et l'API GitHub. MCP n'est jamais le transport entre le plugin et `serve` : c'est un protocole conçu pour un modèle qui appelle des outils, pas d'application à application.

*Rouvre si : MCP se dote d'un transport d'application à application, ou un point d'accès distant arrive pour d'autres raisons.*

## 5. La preview

### L'entrée de preview est générée depuis le texte de `crypte.config.ts`

Le CLI sert un module virtuel qui recopie les expressions `adapter` et `wrap` de la configuration, lues comme du texte. Il n'importe jamais ce fichier : la section 1.5 des contrats y autorise `vite: { plugins: [react()] }`, et un plugin Vite chargé dans le navigateur réclame `node:module`. L'adaptateur vient du champ, jamais d'un nom déduit de `adapter.name`, qui casse dès qu'on enveloppe un adaptateur. Un `wrap` que la configuration exécutée porte mais que son texte ne montre pas, derrière un spread par exemple, fait lever l'entrée au lieu de monter la story sans son contexte. Les noms sont lus dans l'arbre et non dans le texte : sinon `createAdapter({ runtime: 'react' })` fait retenir l'import du plugin React, précisément ce que lire au lieu d'exécuter évite. L'entrée porte donc le TypeScript de l'auteur, que `transformWithOxc` retire dans le hook `load` ; renommer le module virtuel en `.ts` n'y suffit pas, Vite ne le transforme pas pour autant. Le nom donné à oxc est `crypte-preview.ts` dans la racine du projet, pour que le `tsconfig.json` du projet s'applique, et la configuration résolue et le veilleur lui sont passés, sinon oxc garde un cache de `tsconfig` que Vite a déjà vidé.

### Un nom que la configuration construit elle-même est refusé

`const adapter = createAdapter()` puis `export default { adapter }` émettait `const adapter = adapter` : une `ReferenceError` avant l'ouverture du canal, donc un cadre vide sans rien à dire. Refusé parce que déclaré, pas parce qu'inconnu : un nom ni déclaré ni importé est un global, et les refuser refuserait `process.env`. Un nom importé reste accepté, son import partant avec lui. « Déclaré » couvre aussi `export const runtime = …`, `const { runtime } = opts` et `const [runtime] = list`, que lire au seul niveau du fichier manque. Un paramètre, ce qu'une déstructuration en tire et ce qu'un bloc déclare sont retirés avant la comparaison, sinon `createAdapter({ pick: (opts) => opts.runtime })` est refusé alors qu'il est valide.

### Tout ce que l'entrée déclare porte le préfixe `__crypte_`

L'entrée préfixe ses déclarations et alias les imports du noyau. Un nom que la configuration importe atterrit dans le même espace de noms de premier niveau : sans préfixe, `Identifier has already been declared`, donc une preview qui ne charge pas du tout. Les imports d'`adapter` et de `wrap` sont dédoublonnés pour la même raison, les deux pouvant venir du même `import`.

*Rouvre si : un projet nomme lui-même quelque chose `__crypte_…`.*

### Les imports de la configuration sont réécrits absolus, puis pré-empaquetés

Dans un module virtuel, un `./src/…` résout contre l'entrée et ne charge pas : seul le relatif est réécrit, contre la racine réelle et non par calcul sur la chaîne, `posix.normalize` laissant sortir un `../` en silence, et un import qui sort du projet est refusé en le nommant. Les positions de type sont écartées deux fois, par la famille du nœud et par les quatre clés qui désignent un type ; la redondance est voulue, un nom doit manquer aux deux filtres pour voyager. Les deux erreurs n'ont pas le même prix : une clé oubliée envoie un type à l'optimiseur, qui n'y trouve aucun paquet et se plaint à chaque démarrage ; un nœud porteur de valeur oublié retire de l'entrée un import dont elle a besoin, et le cadre reste vide sur une `ReferenceError`. Les paquets qui restent sont donnés à Vite à pré-empaqueter : un paquet de l'espace de travail lié dans `node_modules` n'est ni invalidé ni pré-empaqueté, ses URL de dépendances survivent à une réoptimisation, et le symptôme est un export manquant sans rapport visible. Aucun nom n'est codé en dur, et un alias du projet en est écarté par le résolveur lui-même.

*Rouvre si : Vite invalide un paquet lié comme un module du projet.*

### Le canal vient du CLI par un alias, et ne dépend d'aucune bibliothèque de DOM

L'entrée importe `@crypte/core/preview`, que l'utilisateur n'installe pas : le plugin pose un alias vers le chemin que le CLI résout lui-même, sinon la preview réclame au projet un paquet que personne n'a déclaré. Le noyau n'a aucune dépendance de DOM, y compris en test : le canal est éprouvé par deux fenêtres simulées écrites à la main, pas par jsdom. La surface de DOM dont il dépend tient en six API, que quelques dizaines de lignes reproduisent exactement.

*Rouvre si : le canal se met à dépendre d'une surface de DOM que la simulation ne couvre plus.*

### Chaque story se charge par sa propre promesse

La découverte lit les fichiers sans les exécuter, donc un fichier qui lève à l'import entre au catalogue et n'est découvert qu'ici. Importé statiquement, ce seul fichier emportait l'entrée entière : cadre vide, aucun signal de fin, shell muet alors que les autres stories rendaient parfaitement. Chaque fichier a donc sa promesse et son rattrapage, l'échec est retenu sous le chemin du fichier, et le rendu le relance pour qu'il sorte par le canal comme l'erreur de cette story-là. Le spécificateur reste un littéral, donc Vite garde chaque fichier dans son graphe de modules. Une mise à jour à chaud qui répare un fichier oublie son échec : gardé, il vivait pour la durée de la page, donc réparer ne changeait rien et le panneau montrait encore une pile désignant une ligne disparue.

### Le rejeu à chaud passe par le canal, jamais à côté

Le canal retient ce que le shell a demandé en dernier et rend de quoi le rejouer. Dessiner depuis l'entrée générée court-circuitait le compte rendu : une édition qui fait lever le rendu jetait dans le callback de mise à jour, donc aucune erreur ne partait et le shell gardait son ancienne sortie et son statut « rendu » ; au retour, une édition qui répare remontait dans une iframe masquée, panneau d'erreur toujours ouvert. Les sections 5.4 et 6 des contrats disent l'inverse des deux. Le chemin chaud est celui des fichiers de story, pas des composants : Fast Refresh fait d'un composant une frontière, donc la mise à jour s'y arrête et l'entrée n'est jamais rappelée.

### Le noyau aplatit les enveloppes et fusionne les props, l'adaptateur imbrique

`propsOfStory` mêle le bloc commun, puis les props de la story, puis les surcharges du shell, à plat. `wrapsOf` met les deux déclarations `wrap` en une liste ordonnée, la plus extérieure d'abord, et `Adapter.mount` la prend en quatrième argument, requis dans le type pour qu'un appelant qui l'oublie soit prévenu à l'appel au lieu de monter sans enveloppes en silence ; la valeur par défaut reste à l'exécution, le paquet étant publié. Aplatir et fusionner ne connaissent aucun framework, composer des composants n'appartient qu'à l'adaptateur : deux adaptateurs qui referaient l'un ou l'autre chacun de leur côté divergeraient le jour où l'un apprend quelque chose. Le type du joint, `PreviewWrapper`, vit dans le noyau et l'adaptateur le réexporte, sinon les deux surfaces publiées ne compilent pas ensemble et rien ne le voit, l'entrée générée étant du JavaScript.

*Rouvre si : un framework dont la composition n'est pas un arbre de composants.*

### React ne vit que dans l'adaptateur

Le lint interdit React dans tout `packages/core/src/**`, `preview` compris, l'entrée la plus proche du code de montage et la plus exposée à un import ajouté par commodité. La frontière ne se voit pas en lisant un fichier : rien ne signale sa perte avant que le noyau ne dépende d'un framework, et un adaptateur Vue devient alors impossible sans le réécrire. La règle est ciblée, `packages/react` importe React librement. C'est là que `flushSync` fait finir le rendu tout en laissant l'erreur partir en « unhandled » : le montage rendait la main comme si tout allait bien et la preview annonçait un rendu réussi, donc l'adaptateur passe `onUncaughtError` à `createRoot` et relance l'erreur lui-même.

*Rouvre si : React relance l'erreur au rendu synchrone.*

## 6. Le shell

### Le shell est préconstruit, la preview est compilée dans le projet

Le shell ne connaît aucun framework : il lit un manifeste et parle par le canal. Il est donc construit à l'avance et copié dans `packages/cli/dist` au pack. La preview, elle, importe l'adaptateur installé et les modules de stories : elle appartient au bundle et au framework de l'utilisateur, et c'est ce qui permet à une story de passer une fonction ou un élément en prop.

_Rouvre si : le shell a besoin d'un composant fourni par un framework, ou l'utilisateur doit pouvoir le remplacer._

### Le shell ne se publie pas

`@crypte/shell` reste privé. Le publier ferait un troisième paquet à versionner alors qu'on promet deux installations, et livrer ses sources imposerait Vue et son plugin à un projet qui n'en veut pas.

### Le shell relit le manifeste à chaque `ready`

Le shell n'a pas de client Vite : il est servi en fichiers statiques. Une preview rechargée redit `ready`, donc le rafraîchissement s'accroche à ce message plutôt qu'à un message ajouté au protocole.

### `recover.ts` sépare « rien à afficher » de « sélection perdue »

Où retomber se décide hors du composant : la distinction ne s'éprouve pas depuis un rendu. Confondus, un catalogue vide est traité comme une sélection perdue et ne se sélectionne plus jamais tout seul une fois la première story écrite.

### La sélection retombe sur le même rang dans le même fichier

L'identifiant vient du chemin et du nom : un renommage le change, et le même rang désigne alors la story renommée. Retomber sur la première story du fichier enverrait sur « Par défaut » quelqu'un qui renommait « Avertissement ». Fichier disparu, rien n'est sélectionné : une story d'ailleurs enverrait sur un composant que personne n'a ouvert.

## 7. Les plugins

### `@crypte/tokens` ne lit que la feuille de style déclarée

Le plugin lit les propriétés personnalisées CSS de la feuille que le projet a déclarée dans sa configuration, et d'aucune autre. Il contribue une entrée par famille, par la surface `node` du contrat de plugin. Il ne parcourt jamais l'arborescence pour en trouver une : deviner un chemin est interdit par la section 0 des contrats, et le plugin est actif par défaut, donc il tourne sur des projets qui ne l'ont pas demandé. Une classe comme `.dark` n'est pas lue comme un thème, rien ne l'ayant déclarée comme tel, et un thème faux est pire qu'un thème manquant. Il existe d'abord pour éprouver `NodeHooks` sur un consommateur réel : les plugins fabriqués dans les tests rendent des entrées bien formées, donc ils ne se trompent jamais des façons qu'on n'a pas prévues.

_Rouvre si : un projet dont les tokens ne sont pas dans la feuille déclarée, que l'option `files` ne couvre qu'à moitié ; ou une famille mal coupée sur un vrai système de design._

### Trois plugins par défaut, et une liste nommée ne donne que ce qu'elle nomme

`docs`, `controls` et `tokens` sont actifs quand aucune configuration ne dit le contraire. Le CLI les déclare en dépendances et les active : le CLI dépend des plugins, le core jamais. Un champ `plugins` défini donne exactement ce qu'il liste et rien de plus, pour que personne n'ait à se demander d'où sort un plugin qu'il n'a pas écrit.

_Rouvre si : un plugin du préréglage assez lourd au démarrage pour se sentir, ou assez souvent faux pour que le couper devienne le geste normal._

### Un plugin sans rien à dire rend `inapplicable`

L'état est une valeur à deux branches, par rendu : soit un corps, soit `inapplicable` avec sa raison. Jamais les deux, jamais une raison seule ; un booléen plus une raison optionnelle laisserait écrire les deux formes illégales. Par rendu et non déclaré une fois, parce qu'un plugin peut n'avoir rien à dire sur une story et beaucoup sur la suivante. Conséquence pour les plugins par défaut : ni section vide, ni message « rien trouvé ». L'identifiant est `inapplicable` partout où il se tape, code, `UIContribution` et maquette Figma ; la prose française dit « sans objet », et il n'y a pas de troisième mot. Seul « silence » comme nom de cet état est écarté : ailleurs dans le dépôt le mot désigne un défaut qui ne se signale pas, et ces emplois-là restent.

_Rouvre si : un framework ou un langage de conception qui possède déjà `inapplicable` pour autre chose, une seconde surface où le mot ne se lit pas, ou un meilleur nom trouvé en construisant la bibliothèque d'interface ; les deux orthographes bougent alors ensemble._

### L'état de référence Figma vit dans les `$extensions` du fichier DTCG

Les identifiants de variables Figma sont gardés dans les `$extensions` du fichier DTCG lui-même, pas dans un fichier de référence à côté. Une variable présente dans Figma et absente du code aurait sinon deux histoires possibles, ajoutée côté design ou supprimée côté code, identiques vues de face et appelant des actions opposées. Un identifiant qui n'existe plus dans Figma veut dire supprimé côté design ; pas d'identifiant veut dire nouveau côté code.

_Rouvre si : un consommateur DTCG qui refuse les `$extensions` inconnues, ce que la spécification autorise._

### Le lien vers le dépôt est partagé, le jeton d'accès ne l'est pas

Le lien d'un fichier Figma vers un dépôt vit dans `figma.root.setPluginData` : toute l'équipe hérite du même, et le fichier est explicitement le fichier de design system de ce dépôt. Dans `figma.clientStorage` il serait par utilisateur et par machine, et deux personnes pourraient pointer deux dépôts sans le savoir. Le jeton d'accès, lui, vit bien dans `clientStorage`, par utilisateur.

## 8. L’outillage du dépôt

### Un contrôle vérifie d'abord qu'il a lu quelque chose

Une compilation vide réussit, une extraction muette annonce que tout est conforme, un dossier d'actifs absent pèse zéro octet. Chaque contrôle qui parcourt une liste vérifie donc qu'elle n'est pas vide, en premier cas du fichier, et chaque budget lève au lieu de rendre zéro. Un contrôle vert qui n'affirme plus rien est le mode d'échec le plus coûteux du dépôt, et il ne se voit pas en relisant le garde : chaque garde a une sonde qui casse la garantie et vérifie qu'il rougit. La couverture ne prouve rien non plus, un test qui appelle une fonction sans rien affirmer la couvre entièrement, d'où les `toMatchInlineSnapshot` qui fixent le message entier là où un `toContain` passait sur une phrase à moitié fausse.

### Les points d'extension s'éprouvent dans trois programmes séparés

`packages/core/test/plugin-simulation.d.ts` remplit les points d'extension comme le ferait un plugin installé. Une augmentation de module vaut pour tout le programme et jamais pour le seul fichier qui la porte : le fichier unique rend visible ce que les tests supposent installé. L'état « aucun plugin » n'existe donc dans aucun autre test, et `packages/core/test/no-plugin.test.ts` compile ses cas sans la simulation ; ce sont des `@ts-expect-error`, et une directive inutilisée étant elle-même une erreur, la compilation échoue dans les deux sens. `packages/react/test/public-augmentation.ts` éprouve le chemin recommandé aux plugins, `@crypte/core/protocol`, qui ne se résout pas depuis `packages/core` : il passe par les `.d.ts` publiés, où les points d'extension vivent dans un chunk partagé et ne sont que réexportés.

### L'isolation se lit sur `dist`, par la fermeture des imports

`packages/core/test/isolation.test.ts` lit les bundles et suit la fermeture d'une entrée : son fichier plus tout ce qu'elle atteint par imports relatifs. Une fuite ne recopie pas le code, l'outil produit un chunk séparé et un import, qu'un test lisant le seul fichier d'entrée laisserait passer. Une cible d'import non résolue fait échouer le test, sans quoi la fermeture retomberait en silence au fichier d'entrée. Le test écrit ses deux fixtures dans un dossier temporaire et surtout pas dans `dist`, qui est le contenu publié. La construction précède donc les tests en intégration continue ; la fraîcheur ne se contrôle pas par comparaison de dates, le cache de tâches restaurant les fichiers construits avec leurs dates d'origine. Aucun cas ne s'ancre sur la forme d'un artefact : chercher un nom, une constante ou un chunk précis dans une sortie de bundler finit toujours par ne plus rien vérifier, la forme changeant sans prévenir dans les deux sens, et le test devient tour à tour complaisant et cassant. Ce qui s'éprouve est le mécanisme, sur une structure que le test contrôle lui-même.

### La porte d'entrée et la spécification sont comparées au code

`packages/core/test/protocol/index.test.ts` vérifie qu'`index.ts` réexporte tout ce que les modules déclarent, modules pris dans le dossier et jamais énumérés à la main ; les consommateurs internes importent depuis les fichiers, donc un nom oublié disparaîtrait de l'API publique sans faire rougir le typage ni la construction. Un réexport renommé compte pour son nom public, `export *` est refusé. `packages/core/test/spec.test.ts` exige que tout type exporté figure dans la partie normative de `docs/contracts.md` et qu'aucun nom retiré n'y survive : la recherche porte sur les blocs de code et non sur la prose, puisque c'est de là qu'on réimplémente. Chaque interface y est déclarée par un `interface X`, cherché sur le nom entier sinon `Manifest` est satisfait par `ManifestEntry`, et tous ses champs doivent tenir dans le corps de cette déclaration. La liste des noms retirés est tenue à la main, et `docs/internal/spec-journal.md` est le seul endroit où un nom retiré a le droit d'apparaître : le supprimer casse ce test. Les deux contrôles lisent les formes d'export par le même code, `packages/core/test/exported-names.ts`, deux copies ayant divergé.

### La couverture se règle dans un fichier et se lit sur la pull request

Les seuils vivent dans `test/coverage-thresholds.json`, lus par `test/coverage-report.mjs`, dont le code de sortie est le contrôle `coverage` ; un cas vérifie que `vite.config.ts` n'a pas de clé `thresholds`, évalués aux deux endroits ils rougissaient deux fois pour la même raison. Conséquence assumée : `vp test --coverage` seul affiche les chiffres sans rendre de verdict, c'est `pnpm ready` qui les applique en local. Le seuil est posé au plancher mesuré et ne redescend pas, et les chiffres du jour ne se lisent que dans le fichier de seuils. Trois fichiers sont exclus nommément, l'entrée du CLI, le montage du shell et un module de types : une exclusion est une garantie qu'on retire, et c'est pour cela que la décision de commande vit dans `cli.ts` et qu'`index.ts` n'est que du câblage. Le même corps part au résumé du job et à un commentaire de pull request, supprimé puis reposté pour rester près du dernier commit, retrouvé par le marqueur `<!-- crypte-coverage -->` dont il doit rester exactement un, posté par une seule entrée de matrice et jamais depuis une bifurcation. La liste des commentaires vient de l'API REST et non de `gh pr view --json comments`, qui rend un identifiant GraphQL sur lequel la mise à jour répond 404 ; le script relit ce qu'il a posté, le job n'a pas de `continue-on-error`, et sans mesure le commentaire est réécrit pour dire que rien n'a été mesuré plutôt que d'afficher des chiffres verts sous une CI rouge. `.github/coverage.json` est un fichier du dépôt que `pnpm ready` régénère et que le job compare : aucun robot ne pousse, une règle exigeant que tout passe par une pull request.

*Rouvre si : le badge vaut une branche orpheline ou un droit de pousse sur `main`, ou un ruleset exige une base à jour, ce qui ferait disparaître les branches bloquées par un badge périmé.*

### Les documents cités sont vérifiés contre le code

`test/doc-links.test.mjs` exige que tout fichier `.md` cité existe : une référence en prose devenue fausse ne fait rougir aucun autre test, et un déplacement de dossier en a cassé plusieurs d'un coup, dont deux dans du code publié. Hors de `docs/`, un document se cite par son chemin, un nom nu se retrouvant par son seul nom de fichier et survivant donc au déplacement. Le contrôle ne lit que les commentaires, un chemin fabriqué vivant dans une chaîne ; séparer sur la nature de la ligne évite d'exempter des fichiers entiers, et aucun n'est écarté. `packages/cli/test/guide.test.ts` extrait de `docs/guide.md` les blocs marqués par un commentaire `<!-- checked: nom -->`, jamais par leur position, et les joue contre le CLI. La liste des marqueurs est comparée à une liste attendue, sans quoi un marqueur renommé ferait passer l'exemple en silence, et l'extraction lève sur un marqueur inconnu au lieu de ramener le premier bloc du guide. Seuls les imports et l'appel à `defineConfig` sont remplacés, la forme de l'objet restant celle du guide mot pour mot, chaque nom importé est confronté aux exports réels du paquet cité, et les substitutions sont vérifiées, une `String.replace` muette laissant sinon l'exemple intact. `test/cli-surface.test.mjs` prend le switch de `packages/cli/src/cli.ts` pour source et compare ses étiquettes à la ligne d'aide, à la phrase du guide et à celle de `docs/site/llms.txt`, sans quoi le compte des commandes redevient une affaire de mémoire sur deux documents destinés à l'extérieur.

### Une fixture par cas, jamais un état partagé

Chaque cas monte sa propre copie de projet, son serveur et sa page par `test.extend`, et vitest les démonte même si le cas lève ; un tableau de cas qui veut une fixture s'écrit avec `test.for`, `test.each` ne passant aucun contexte. `test/sweep-tmp.mjs` efface en `globalSetup` les copies qu'un lancement tué a laissées : le retirer ne fait rougir aucun cas, c'est le seul mécanisme d'ici que rien ne surveille. `sequence.shuffle` mélange l'ordre des cas et pas celui des fichiers, qui annulerait le lancement des plus longs d'abord, et c'est le seul moyen de voir un couplage entre deux cas ; les réglages partagés sont épandus dans chaque projet, un projet qui étend une autre configuration Vite n'héritant de rien de la racine et retournant en silence à l'ordre fixe. La fixture de résolution est un vrai projet, avec alias `@/`, `jsconfig.json` commenté sans `tsconfig.json`, fichiers `.jsx` et import d'asset : son `baseUrl` est refusé par TypeScript, et son exclusion du lint est là pour ça, pas par négligence.

### Un test ouvre un vrai navigateur et regarde l'écran

`packages/cli/test/screen.test.ts` démarre le serveur, ouvre Chromium et vérifie ce qui s'affiche : une route qui répond ne dit pas qu'une story se rend, et au moment où ces cas ont été écrits toutes les routes répondaient sur une page blanche. Ils forment un groupe qui passe après les autres, seuls sur la machine. Installer le paquet Playwright ne télécharge pas le navigateur, d'où une étape d'installation avant la suite, sans quoi ce contrôle ne tourne que sur la machine de développement ; Chromium est restauré depuis le cache, faute de quoi le job est annulé sur dépassement de budget sans une ligne d'erreur. Les cas copient `apps/demo` avant de la démarrer, `startDev` écrivant sous la racine reçue et `apps/demo/.crypte/fingerprint.json` étant suivi par git. L'optimiseur de Vite pouvant déclencher un `full-reload` après le crawl, ils sondent le nombre de navigations du cadre au lieu de l'affirmer. Le shell qu'ils voient est une copie préconstruite : `packages/cli/test/shell-copy.test.ts` compare la date du fichier le plus récent des sources du shell à celle de la copie embarquée, sans quoi éditer les sources sans reconstruire laisse tous ces cas juger la version d'avant, au vert. De même, une suite verte sur un projet qui déclare React Compiler ne dit pas qu'il a tourné : un cas lit le module servi et y cherche les formes que seule cette transformation produit, par `transformRequest` et non par une requête HTTP, qui laissait `server.close()` bloqué.

*Rouvre si : l'empreinte cesse d'être commitée, ou la cause du rechargement est isolée par une mesure.*

### Les fichiers générés et commités sont verrouillés par `git diff --exit-code`

La suite écrit l'empreinte de la fixture du catalogue, et l'étape d'intégration continue échoue si le fichier commité ne correspond plus ; c'est la même étape qui garde les réexports générés. Rien ne lit cette empreinte aujourd'hui, donc sans le verrou l'historique décrirait un état qui n'existe plus. `.crypte/` est exclu du formatage, comme tout fichier généré et commité et comme les instantanés : sinon le formatage du commit et l'écriture suivante se disputent la forme, et l'arbre n'est jamais propre deux commandes de suite. Le contrôle de mutation, qui exige un arbre propre à la fin, remet l'empreinte à sa valeur au dernier passage plutôt que d'en sortir ces fichiers. Il n'existe pas de script pour la régénérer : le producteur est du TypeScript non exposé, et `vp node` exigerait une extension explicite sur chaque import relatif des sources, ce que la quatrième contrainte interdit.

### Les budgets : le poids envoyé, et le temps jusqu'à la première story

Le poids du shell couvre `dist/shell` entier et pas seulement `assets/` : `index.html` est le premier fichier que le navigateur télécharge, et tout ce que Vite émettrait ailleurs échapperait au budget en silence. Les cartes de source en sont exclues, elles ne partent pas chez l'utilisateur. Le poids installé se calcule sans empaqueter, en lisant ce que les paquets déclarent, en résolvant `catalog:` depuis `pnpm-workspace.yaml` et en écartant les liens d'espace de travail : empaqueter demanderait pnpm, non garanti sur un runner, et npm refuse de tourner ici à cause de `devEngines`. Les clés obligatoires du manifeste sont tenues par un test de types, exact là où une expression régulière sur la source serait approximative.

Le démarrage à froid se mesure jusqu'à la première story rendue, pas jusqu'au serveur à l'écoute : Vite compile à la demande, donc ce chronomètre-là mesure un traitement qui n'a rien traité et ne bougerait plus quoi qu'on ajoute au démarrage. La mesure prend la médiane de plusieurs lancements, cache d'optimisation vidé avant chacun. La sortie du serveur est nettoyée de ses couleurs avant d'y lire l'adresse : Vite colorise quand il détecte l'intégration continue et glisse un code de gras entre `localhost:` et le port, sans quoi l'adresse n'est jamais trouvée et le job attend jusqu'à son expiration. Invisible en local, où Vite n'active pas la couleur.

### `ci-passed`, le seul contrôle exigé par les règles de branche

Il dépend de tous les autres jobs, tourne toujours, et échoue si l'un d'eux a échoué ou a été annulé. Sans lui il faudrait exiger les jobs un par un, ce qui grave la composition de la matrice dans un réglage stocké hors du dépôt : le jour où une version de Node la quitte, la pull request attend sans message un contrôle qui ne viendra jamais. Sa condition lit `needs.*.result` et non une liste écrite à la main. Un cas garde le fichier de workflow lui-même, un `needs` nommant un job absent faisant échouer GitHub sans job ni annotation.

`cancel-in-progress: true` sur la vérification, jamais sur un workflow qui publie : on annule ce qui vérifie, pas ce qui modifie un état. `fail-fast: false` sur la matrice de versions, qui existe pour dire si une rupture touche une version de Node ou les deux. Chaque job déclare son délai d'expiration, sinon une attente réseau tourne six heures, et la raison de la valeur est écrite à côté. `workflow_dispatch` relance à la main au lieu de pousser un commit vide. Le jeton est réduit à la lecture, seule exception `pull-requests: write`, déclaré sur le job de couverture pour son commentaire. `dependency-review` refuse une pull request qui introduit une dépendance vulnérable. Chaque `uses:` porte un SHA de commit suivi du tag en commentaire, tous deux écrits par Dependabot, qui ne surveille que les actions parce que ces empreintes vieillissent en silence, correctifs de sécurité compris ; pour contrôler un épinglage, déréférencer par `git/tags/{sha}`, car sur un tag annoté `git/ref/tags/vN` rend le SHA de l'objet tag et fait conclure à tort que l'épinglage est faux.

*Rouvre si : un `NPM_TOKEN` entre dans ce dépôt, moment où une action non épinglée atteindrait autre chose qu'un `GITHUB_TOKEN`.*

### TypeScript est épinglé sur une version exacte, en lignée 6

Le catalogue déclare une version et pas une plage : l'API de génération de types n'est pas stable, et une version corrective en changerait le comportement chez les consommateurs plutôt qu'ici. La lignée 6 tient à `vue-tsc`, qui charge un chemin de l'API programmatique que la 7 n'expose plus et échoue au démarrage. `vp pack` émet pourtant les déclarations publiées avec son propre TypeScript 7, embarqué par l'outillage : deux compilateurs cohabitent, l'un vérifie et l'autre émet, et leur comportement n'est pas garanti identique. `devEngines` n'est pas écrit à la main mais par `vp install`, et le retirer produit une modification non commitée au prochain `vp install`.

*Rouvre si : l'API de génération de types est déclarée stable, ou `vue-tsc` fonctionne avec TypeScript 7, ce que rien ne surveille depuis le retrait de la sonde.*

### `vp check` ne vérifie les types que si on le lui demande

Le bloc `lint` de `vite.config.ts` active `typeAware` et `typeCheck` ; sans ces deux options `vp check` formate et linte sans vérifier aucun type, et `export const x: string = 42` passe le contrôle, le pack et l'intégration continue. Les retirer rend le `tsconfig` strict décoratif. Les composants Vue lui sont opaques, déclarés comme tels dans `apps/shell/src/env.d.ts` : `vue-tsc`, lancé par le script `typecheck` du shell et par la CI juste après, est le seul à lire le template, où une liaison vers une variable inexistante ne se voit ni au lint, ni au build, ni aux tests. Un projet vitest nommé `types` passe enfin le compilateur sur les `*.test-d.ts` avec `tsconfig.types.json` : `vp check` voit une erreur de type mais ne demande jamais qu'un type soit ce qu'on promet, et dégrader `PropsOf<C>` de `infer P` à `any` laisse tout au vert alors que l'autocomplétion de chaque fichier de story en dépend. Ce projet s'éteint en silence de deux façons, un programme qui n'inclut plus ces fichiers et `typecheck.enabled: false`, annonçant dans les deux cas « aucune erreur » sans rien compiler, et `test/typecheck.test.mjs` garde le câblage. Ne pas y ajouter ce que `vp check` fait déjà échouer, ce serait évaluer le même compilateur deux fois pour le même verdict.

*Rouvre si : une garantie de type que `vp check` ne sait pas exprimer, ou un second paquet exposant sa propre surface d'inférence.*

### La revue se décide sur l'autorité, pas sur l'extension

Un diff dont tous les fichiers sont des `.md`, sans `docs/contracts.md`, `docs/internal/comprendre.md`, un `CLAUDE.md` ni rien sous `.claude/`, passe sans revue ; tout le reste en porte une. Le critère n'est pas le dossier : le registre de décisions est de la documentation par son emplacement et fait foi par son contenu. Le classement vit dans `test/review-check.mjs` et non dans le YAML du workflow, parce que son mode de panne est une exemption qui s'élargit sans bruit et qu'un `case` dans un `run:` ne se teste qu'en poussant.

*Rouvre si : un verdict de revue vide sur de la prose ordinaire, celle qui n'est ni un contrat ni une règle de travail.*

### Un changement de commentaire de ligne n'exige pas de note de version

`require-changeset` lit le patch de chaque fichier publié : si toutes les lignes changées sont des commentaires `//` ou des lignes vides, le fichier n'exige pas de note. Un bloc `/** */` en exige une, car posé sur un type exporté il est émis dans le `.d.ts` publié, là où un `//` en est retiré. Deux cas sortent de l'exemption : un commentaire directif, `@ts-expect-error`, `eslint-disable`, `v8 ignore` ou une référence triple-slash, qui a la forme d'un commentaire et l'effet d'une ligne de code ; et un fichier sans patch, l'API n'en fournissant plus au-delà d'une certaine taille, où bloquer est le sens sûr.

*Rouvre si : le build cesse d'émettre les déclarations depuis la source, ou se met à y garder les commentaires de ligne.*

### Deux dépôts, séparés par les notes contre l'analyse

Crypte vit dans deux monorepos : celui-ci, public et MIT, et un second, fermé, qui porte `crypte serve`, les plugins sous licence et l'application web. La ligne n'est pas public contre privé, c'est notes d'ingénierie contre analyse business. Les notes restent ici, citées partout dans le dépôt y compris par des commentaires de source publiée, et `test/doc-links.test.mjs` échoue si le fichier part. Deux choses sont publiques par engagement : la frontière gratuit/payant, et le mécanisme de clé signée avec son algorithme et son code de vérification, une signature ne tirant aucune force du secret de son fonctionnement. Le dépôt fermé consomme `@crypte/core` et `@crypte/cli` en versions publiées et jamais en liens d'espace de travail : c'est plus lent à itérer, et c'est le seul contrôle honnête de l'isolation des trois entrées du core.

*Rouvre si : une cadence de déploiement de la plateforme gêne la publication des paquets, ou un contributeur doit voir la plateforme sans voir `serve`.*

### La documentation se sépare par public, pas par langue

`docs/` porte ce qu'un utilisateur ou un contributeur lit, en anglais : `README.md`, `CONTRIBUTING.md`, les contrats, le guide, les messages d'erreur du CLI et les commentaires du source publié, et `test/published-english.test.mjs` refuse un accent ou un mot-outil français dans `packages/*/src`. `docs/internal/` porte les notes de mainteneur, en français, comme `CLAUDE.md` et les skills, que l'outillage lit à un emplacement fixe et qui ne peuvent donc pas bouger. Pas de `docs/fr/` : par convention `fr/` contient la traduction française d'une documentation anglaise, qui ici n'existe pas. Un document interne n'est gardé que s'il dit ce qu'aucun autre système ne dit mieux, le tracker portant le suivi, le disque l'arborescence et git l'historique ; `test/manifest-size.mjs` n'assertionne rien et ne tourne pas en intégration continue, mais il a produit les mesures sur lesquelles repose l'empreinte réduite, et le supprimer reviendrait à défaire une décision écrite.

*Rouvre si : un contributeur extérieur, une vraie traduction dans une seconde langue, ou un point remonté deux fois par deux revues faute d'un fichier qui garde les arbitrages.*

### Du code mort ne part que si deux réfuteurs ont échoué à l'atteindre

Un candidat est nommé par une mesure, jamais par une opinion. Deux agents essaient ensuite de l'atteindre par des angles opposés, l'un en remontant les appelants jusqu'à un vrai point d'entrée, l'autre en écrivant une sonde et en l'exécutant ; le candidat ne part que si les deux échouent, et tout doute qu'ils admettent compte comme atteignable. Une réfutation qui ne nomme aucune mesure ne vaut pas plus que la lecture qu'elle contredit. Retirer un mot-clé `export` est exempté, le compilateur prouvant l'absence de consommateur puisque `vp check` couvre `src` et `test` ensemble. Dans les fichiers de test la règle s'inverse : le candidat est une assertion morte, les réfuteurs tentent de la faire rougir en cassant la garantie dans le source, et une assertion qui vise le mauvais côté de sa paire se répare au lieu de se supprimer. `coverage.include` se limitant aux sources, `test/**` a son propre lancement pour nommer ses candidats, et ce lancement dit ce que la suite n'a pas exécuté, jamais que rien n'appelle.

*Rouvre si : un réfuteur qui ne réfute rien sur toute une vague, ou une suppression que cette règle a autorisée et qu'il a fallu remettre.*

## 9. La publication

### Le code publié est en anglais

Aucun caractère accentué dans `packages/*/src` : `test/published-english.test.mjs` le refuse. L'anglais n'en porte aucun, donc une seule ligne revenue au français se voit. Les notes de conception restent en français, dans `docs/internal/`.

### L'exception des accents graves tient sur une portée sans espace

`packages/core/src/protocol/id.ts` documente la normalisation avec ses propres exemples, « é devient e » : ce sont les données du problème, pas de la prose française. La portée sans espace empêche qu'une phrase française entière y passe. Le contrôle n'attrape ni l'anglais mal écrit ni le français sans accent.

### La génération de `exports` est coupée sur `@crypte/cli`

Avec la génération active, l'outil réécrit aussi `bin` en dérivant son nom de celui du paquet : la commande installée s'appellerait `cli` et non `crypte`. Le paquet se construirait sans erreur et rien ne le signalerait. `core` et `react` gardent la génération active.

### Le budget de poids installé compte les binaires de Vite

Le plafond posé dans `test/budgets.json` porte sur tout ce que l'utilisateur télécharge, les binaires natifs livrés par Vite compris (`@rolldown/binding-*`, `lightningcss-*`), qui en forment la plus grosse part. Les exclure est refusé : l'utilisateur les télécharge, donc un chiffre qui les cache parle de notre confort et pas de son installation. Leur taille diffère d'une plateforme à l'autre, donc le seuil tient sur celle qui juge et ne mord que si notre code grossit fortement. Ce qu'il garde vraiment est notre moitié JavaScript. Les dépendances directes sont épinglées aux versions installées, pour qu'une sortie de Vite ne déplace pas le chiffre sur un commit qui n'a rien changé.

*Rouvre si : un binaire natif grossit chez une dépendance transitive, la réponse étant d'installer depuis `pnpm-lock.yaml` et non de relever le plafond ; ou `vite` passe en `peerDependencies`, qui allégerait beaucoup mais change le contrat d'un paquet publié.*

### Aucun appel sortant depuis un paquet gratuit

Le CLI n'émet pas de télémétrie. La vérification de licence est faite par le paquet payant lui-même, jamais par `core` ni par le CLI. Le README le promet publiquement, donc un appel sortant ajouté ici démentirait un texte publié.

