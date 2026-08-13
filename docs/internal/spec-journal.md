# Journal des versions de la spécification

L'historique de `docs/contracts.md`, de la v0.1 à la v0.9, quand le document portait un autre nom et s'écrivait en français.

Conservé ici plutôt que traduit : ce sont des décisions déjà prises, avec leur raison, et une traduction approximative en perdrait le fil. Le document public n'en garde que le tableau des changements.

---


**v0.9.** `wrap` n'empile que des composants.

| Avant | Après |
|---|---|
| quatre formes, dont `(story) => …` | trois formes, toutes déclaratives |

**Pourquoi.** Pour React, un composant est une fonction. `wrap: TooltipProvider` et `wrap: (story) => …` étaient donc le même type, et l'adaptateur du lot suivant aurait dû deviner lequel des deux il tenait, en se trompant une fois sur deux. Ni le typage ni un `typeof` à l'exécution ne les séparent.

La forme fonction était par ailleurs la seule à ne pas être portable, ce que la section 2.5 disait déjà, et aucun usage ne la réclamait : elle venait d'un outil qui la nomme décorateur, pas d'un besoin rencontré ici.

**Ce qu'elle servait, et qui subsiste.** Passer une valeur calculée, par les props de la forme tableau. Ce qu'elle seule permettait, un balisage jeté à la volée, demande maintenant un petit composant.

Si un usage réel la réclame, elle reviendra sous une clé distincte qui dira sa non-portabilité, et l'ajouter coûtera alors ce qu'il aurait coûté aujourd'hui.

Aucune migration à prévoir, rien n'est publié.

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
