# Decisions

What we chose, what we turned down, and why. Newest first.

A decision is written here when it is made. `architecture.md` explains how a mechanism works, and it is written once the code exists. `suivi.md` holds review findings we chose not to fix yet. Neither of them says what else was on the table.

Each entry has four parts. The last one matters most: it says what would make the decision wrong.

An entry is never deleted. A decision that no longer holds gets a new entry that replaces it, and the old one stays, so the change of mind is readable.

---

## A plugin contributes entries, synchronously, and never fatally

_2026-08-24_

**Decided.** `NodeHooks` carries one hook, `entries`, a plain function taking a context and returning entries. It is **synchronous**. It runs **after the stories**, in the order `plugins` declares. A contribution may not be a story, and the producer checks that at run time as well as in the types. Anything that goes wrong with a contribution, a throw, a wrong return, an entry that is not one, a taken identifier, a value JSON would rewrite, **refuses that contribution and says which plugin it came from**, and nothing stops the server.

The one exception is a key whose value is `undefined`: it is **left out** rather than refused. Both are remedies 4.5 names, and the line between them is whether dropping changes the value.

`CryptePlugin` becomes a real type in the protocol; `@crypte/cli` re-exports it instead of redeclaring it as `unknown`. `UIContribution` and `PreviewHooks` stay opaque.

**Rejected.** Asynchronous hooks, for the reason below. Trusting the types about what a plugin hands over: `ContributedEntry` holds at compile time and a plugin is installed compiled, so an entry typed `story` reaches the producer and, unrefused, would enter the committed fingerprint. Measured by the review of PR #51. A generic build step or a CLI command, neither of which has a consumer. An `order` field, which every plugin would set to zero. Making a plugin's failure fatal, which lets one broken dependency stop a dev server. Putting plugin failures in `Catalogue.skipped`, whose `file` is contractually the path of a story file. And a `PluginManifestEntries` extension point, since no third-party plugin exists.

**Why synchronous, when Rollup and Vite are not.** A hook that may return a promise is the shape that never needs revisiting, and it was the tempting choice. But `buildCatalogue` is called from a watcher callback, `dev.ts:144`, where the debounce guards against bursts of events and not against two overlapping rebuilds. Making it async buys a real race today, in the most measured part of the CLI, for a capability nobody needs: `@crypte/tokens` reads local files, which is what the story reader already does synchronously.

What makes that safe rather than short-sighted: **nothing is published, and 6.5 says this contract is not frozen.** Changing the signature later breaks no user, because there are none. The lot's own order says the consumer corrects the surface, and this is exactly the kind of thing it will correct.

**Why refusing rather than blocking, when a story collision is fatal.** `assertDistinct` throws on two stories sharing an identifier, and that is right: both files belong to the author, who can rename one. A plugin is not the author's text. Two plugins colliding may only be fixable by uninstalling one, and a dev server that will not start is a worse answer than a catalogue missing a panel and a line saying why.

**Why a run-time list beside `Exclude`.** `CONTRIBUTABLE` is not a duplicate of the type: one holds while a plugin is compiled, the other while it runs, and a published plugin only ever does the second. The two live in the same file so they are read together, which is the only thing that keeps them in step.

**What would reopen it.** A plugin whose source is genuinely asynchronous, a network call or a database, which makes the promise-tolerant signature worth its race. A plugin that must run before the stories, which no ordering rule covers today. Or a third-party plugin with its own nature of entry, which is what `PluginManifestEntries` would be for, on the model of `PluginPropDetails`.

---

## A tokens entry is a family, and every token is read per theme

_2026-08-23_

**Decided.** Four shapes, and they are together because getting any one wrong is a manifest break rather than an added field.

One `TokensEntry` carries a **family**, not a single token. `path` and `name` place it in the tree the way a story's do, and `tokens` is keyed by token name, so the value has no `name` of its own. `themes` is **required**, so a project with a single theme holds one key. `value` is always the resolved literal and `alias` is the chain that led to it, ordered from the token towards the literal. `MANIFEST_VERSION` stays at `1`.

**Rejected.** One entry per token, which a three-hundred-token design system turns into three hundred entries for a thing nobody navigates to on its own. A single `value` with themes added later, which would have changed the shape of every token in every manifest. An `alias` that replaces `value` instead of accompanying it, which would make drawing a swatch depend on resolving a chain. An open `type: string`, which no negative test can hold. And a `PluginTokenValue` extension point, since no plugin asks for one and the lot's own frontier excludes `PluginManifestEntries` for the same reason.

**Why keyed rather than listed.** The precedent is already in the file: `StoryEntry.details` is a `Record` keyed by prop name for exactly this reason, and a token identifier is derived the same way a story's is, per section 4.3. So a comment or a diff still anchors on one token without one token being one entry.

**Why the version does not move.** `"tokens"` was a reserved value of a `type` field that has existed since v1.0, and the reserve was put there for this. Nothing required moved on `StoryEntry`, so a reader that only knows stories skips what it does not recognise. The rule that does force a bump, adding a required field once a published version writes manifests, is in `suivi.md` and is untouched: nothing is published.

**What would reopen it.** A real reader in `@crypte/tokens` finding a token whose kinds do not fit the six, which widens `TokenKind` and costs nothing. A format where a family cannot be decided without reading the file, which would move the grouping out of the entry. Or a consumer that needs to know which file a family came from, which is an optional field and deliberately deferred to the plugin that will demonstrate it.

---

## The review gate reads authority, not extensions

_2026-08-22_

**Decided.** Two things, which together make one rule: review what carries authority, do not review what merely narrates.

A diff whose every file is a `.md`, none of them `docs/contracts.md`, `docs/decisions.md`, `docs/internal/suivi.md`, a `CLAUDE.md` or anything under `.claude/`, needs no review at all. `require-review.yml` establishes that on its own and passes. Everything else needs one, and those same five forms get the stronger reviewer despite their extension.

The classification lives in `test/review-check.mjs`, covered by `test/review-check.test.mjs`, not in the workflow's YAML.

**Rejected.** Three things. Reviewing everything, which is what the gate did: two consecutive verdicts came back empty on documentation, and the review skill names that failure itself, a review that finds nothing teaches nobody to read the next one. Exempting all documentation, which would have exempted the contracts and the decision record, the one place a review earns its cost. And the guard rail's own remedy, "revenir au modèle courant partout", for the reason below.

**Why those five forms and not a folder.** The old criterion was file location, standing in for how much reasoning a diff demands. It broke on this repository's own shape: `decisions.md` is documentation by its folder and the decision record by its content, and `suivi.md` holds deferred defects with the measurement and the reason not to fix them, which the review reads so it stops re-raising them.

**Why the remedy is narrower than the guard rail asked for.** `architecture.md` already carried the trigger, and it fired: a review missed points a manual re-read caught. But the same measurement shows the cheap reviewer is not the problem. PR #45, 908 lines over nine decision entries, was reviewed in three tool calls and returned nothing, while a manual re-read found two errors. PR #46, 120 lines, was reviewed in twenty calls and genuinely verified. Switching everything back would have punished the case that works. What failed was the criterion, so the criterion is what changed.

**Why the classification is a tested module rather than shell in the workflow.** Its failure mode is an exemption that widens silently, and a `case` block inside a `run:` can only be exercised by pushing. The sibling control had already solved the identical problem this way, `require-changeset.yml` being one line calling `test/changeset-check.mjs`. Measured before extracting: a `CLAUDE.md` nested inside a package, and a contracts file split into a folder, both classified as prose. Neither shape exists today, which is exactly why nobody would have noticed.

**What it cost.** `CLAUDE.md` said "brouillon, revue, puis ouverture, dans cet ordre, sans exception", so this contradicted it and it was amended in the same diff. The exception is now written there too, with the same list, because two documents disagreeing about the review gate is worse than either rule alone.

**What would reopen it.** An empty verdict on **ordinary** prose, the kind that is neither a contract nor a working rule. Both measured empty verdicts touched `decisions.md`, so neither says anything about the cheap reviewer on ordinary prose. The day one does, the guard rail's remedy applies as written.

---

## Two repositories, and the line between them is not public against private

_2026-08-22_

**Decided.** Crypte lives in two repositories, both monorepos. This one is public and MIT. A second one is closed, and holds three things: `crypte serve`, the twelve plugins meant for the licence, and the web application that will serve the site and the account area.

That is why `docs/internal/plugins.md` can name `serve` and those plugins without them being here. The catalogue is the catalogue; it does not follow that everything in it ships from this repository.

**Rejected.** Keeping the closed code here as private packages, which would leave it readable in a public repository and cancel the point of closing it. A third repository for the platform, whose strongest argument dissolves on inspection: the signing private key lives in an edge function's secret store, never in a repository, so the blast radius of a repository leak is the same either way.

**The line, and it is the part worth writing down.** Not public against private, but **engineering notes against business analysis**.

Engineering notes stay here, and the reason is measured rather than felt: `docs/internal/architecture.md` is cited by 53 files, including comments in published source, and `docs/internal/suivi.md` is read by the review itself, which is what stops an already-arbitrated point from being raised again every round. Moving either would break `test/doc-links.test.mjs` and orphan those citations. An outside contributor to an MIT project needs `architecture.md`: it is the file that says what breaks if you remove a mechanism.

Competitive analysis and the licensing scheme went the other way, and they were written here first before being moved out. That is the mistake this entry exists to keep from being repeated.

**Two things stay public and are not negotiable.** The free/paid boundary itself, because transparency about what costs money is a commitment to keep in the README rather than something to discover at install time. And the signed-key mechanism: algorithm, format and verification code, because a signature draws no strength from the secrecy of how it works, and hiding it buys an incomprehensible failure the day a date expires.

**What it costs.** Two CI pipelines, two dependency-update surfaces, and one contract that spans both: the shape of the signed key. `serve` will consume `@crypte/core` and `@crypte/cli` as **published versions**, not as workspace links, which slows local iteration and in exchange exercises the public API from outside the monorepo. That is the only honest check on the isolation of the core's three entry points, which is structural constraint 3.

**What would reopen it.** A platform deploy cadence that gets in the way of publishing packages, which would argue for a third repository. Or a contributor who should see the platform but not `serve`.

---

## The published catalogue is MIT, and the paid line is one editor against many

_2026-08-21_

**Decided.** Everything the catalogue publishes goes to npm under MIT: the core, the CLI, the adapters, and every plugin named in `docs/internal/plugins.md` as free. What is sold is `crypte serve` in **multi-user** mode, and a reserve of twelve plugins that have never been published and so are still free of any licence.

Two plugins were candidates for the paid side and stay free. `visual-tests` carries the visual rendering of pull requests, which none of the four competitors offers and which Backlight had put at the head of its pitch: pricing it removes it from the adoption argument exactly where it earns the most. `coverage` computes a metric from the code, which **is** the project's differentiator rather than an extra.

**Rejected.** Three lines. « Local is free, a server is paid », which the Nuxt UI Pro model breaks: local code under licence, free in development, a key to build in production, no infrastructure to operate. « Local against deployed », which cannot be detected honestly: listening on `0.0.0.0`, owning a domain, running in a container, each is one line away. And per-feature gating, the most fragmenting of the three possible tiers.

**Why one editor against many.** Nobody deploys a single-identity `serve` for their team: every contribution would be signed by the same person and review loses its point. This is not a crippled feature somebody would want to uncripple, it is a mode that does not answer a team's need, so the boundary holds without a lock.

**Why now, and only now.** A version published under MIT stays MIT forever. The licence of later versions can change, a contributor whose code changes licence does not come back. Nothing is published yet, which is the one window where this costs nothing. **The order of the moves matters more than the moves.** Tracked in DCJ-234, which blocks DCJ-178.

**One contradiction closed with it.** `plugins.md` has carried « Télémétrie. Non. » since the first pass, and the strategy notes describe reported analytics. The resolution: **no telemetry in the free CLI, announced analytics in paid `serve`.** On a tool that lives inside its users' code, telemetry discovered costs infinitely more than telemetry announced.

**What would reopen it.** A plugin on the free list turning out to be the only thing anybody would pay for, which would mean the sorting criterion is wrong rather than the licence. Or a fork that sells what we give away, which the Sentry precedent says happens only on massive success and mostly captures people who would never have paid.

---

## The committed fingerprint stays, and the reason is written down this time

_2026-08-21_

**Decided.** `fingerprint.ts`, the committed reduced fingerprint and its CI lock stay exactly as the entry of 2026-08-13 put them. `test/manifest-size.mjs` stays with them, because it is what produced the figures below.

**What this entry is really for.** A planning note of 2026-08-20 announced the removal of all three « à la passe de roadmap, une autre solution plus simple étant retenue », and **never named the simpler solution**. Worse, the paragraph above that announcement argues the other way: « git fait déjà les deltas. Une empreinte commitée à chaque version, c'est une version complète en apparence et une suite de deltas dans le stockage » is a case *for* committing the fingerprint, not against it. The note contradicts itself.

The first draft of this entry removed the fingerprint and quoted that sentence as the reason. That reading was wrong, and it is the reason this entry exists rather than the removal.

**Rejected.** Removing it on the strength of an announcement whose reason cannot be found.

**Why, and the repository has already paid for this lesson once.** DCJ-167 carried « pas de `tsconfig.json` mais un `jsconfig.json` » without its reason. When the time came to implement it the reason was nowhere, and **the decision ended up inverted after an entire exchange spent looking for it.** Inverting a decision whose rationale is missing is not neutral: it is the documented failure mode of this project, and the fingerprint is the same shape, with code already written.

**What it buys that nothing replaces.** A catalogue change visible in a pull request diff. Rename a story or add a prop, and the committed fingerprint moves, so a reviewer sees it without running anything. « Rebuild the manifest at two commits » covers the changes screen and the comment anchor, at a cost, but it cannot cover this one: **a reviewer reading a diff does not run a build.** Nothing else in the repository makes a catalogue change visible at review time, and making silent changes loud is most of what the controls here exist for.

**What keeping it costs, stated rather than glossed.** One generated-but-committed file with a lock, which `suivi.md` already notes has a narrower scope than the mechanism suggests. And one known wart: reordering a props block changes `source`, so it changes the digest, though the render is identical. That is diff noise on a change that means nothing, and it is the one thing worth fixing.

**The measurements, kept here so they outlive the script.** A synthetic manifest with eight documented props per component: 34.1 KB raw and 5.2 KB gzipped at 23 stories, 140.1 KB and 17.8 KB at 100, 706.2 KB and 83.9 KB at 500, 2.8 MB and 330.5 KB at 2000. The reduced fingerprint: 268 bytes per story, so 130.9 KB raw and 9.4 KB gzipped at 500 stories, with the committed fixture confirming 261 bytes per entry. **The ratio between the two files is 5.4**, not the 6.5 first published nor the 8.5 that followed: the figure moved three times, each time because the measurement was not taken on the shape the producer actually writes.

Full copies of the manifest do not hold: 500 versions of a 500-story project weigh 41 MB gzipped. That is what the fingerprint exists instead of.

**What would reopen it.** Someone naming the simpler solution, which nobody has yet. Or a project whose fingerprint changes on every build anyway, which would mean the reduced form keeps something it should not, and which would be measured before moving.

---

## The manifest carries more than stories: `tokens` now, `page` in two stages

_2026-08-21_

**Decided.** Two entry kinds leave the reserve of section 7.

**`tokens` splits in two.** The `TokensEntry` type belongs to the protocol, discovery and reading belong to `@crypte/tokens`: CSS variables, DTCG, a `tokens.ts` module, Tailwind, and that list will only grow, which is the definition of a plugin. The plugin has two surfaces, not one, because `getComputedStyle` is the only way to read a value that is correct in both light and dark, and a `node` hook runs before any browser exists.

**`page` splits by stage.** Stage one is markdown in the repository, discovered the way stories are, rendered next to components, no server. Stage two is the same files edited by designers and returned as a pull request, which needs `crypte serve`.

**Rejected.** Putting the token formats in the core, which would make every new format a core release. Treating `page` as one piece of work, which is what made it look expensive and far away. And a token manager in the sense zeroheight and Supernova mean it, being the store of record and syncing from Figma as the source: that is a separate product, and its direction of travel is the opposite of ours.

**Why the split is not new.** It is the line prop extraction already follows. The CLI and the adapter fill `details`, and `@crypte/docs` only draws a table from it. The line is not important against unimportant, it is **producing data against displaying it**.

**Why now.** Not internal tidiness. zeroheight and Supernova both ship a token manager, and both sell guidelines as the thing neither Figma nor Storybook exposes. And `tokens` is the first plugin that writes to the manifest, so it is what exercises `NodeHooks` before that contract is frozen: if the API has to move, one plugin has to be fixed.

**A hard prerequisite this creates.** No plugin can contribute manifest entries today. `NodeHooks` is named in section 6 and never specified, and it is now the bottleneck of three separate pieces of work. Tracked in DCJ-227.

**What would reopen it.** A project whose tokens cannot be read without running its build, which would put us back into reading a `vite.config` and is refused by the first principle.

---

## Three plugins are on by default, and a named `plugins` list gets exactly those

_2026-08-21_

**Decided.** `docs`, `controls` and `tokens` are enabled by default and can be switched off. The CLI declares them as dependencies and enables them when no configuration says otherwise, so the dependency runs the right way: the CLI depends on plugins, the core never does.

No configuration file, or a file with no `plugins` field: the preset. A `plugins` field that is defined: **exactly** what it lists. The CLI exports a `defaultPlugins` array to spread for anyone who wants the preset plus their own.

**Rejected.** No preset at all, which leaves a first run showing components and nothing else. And a defined `plugins` field that still keeps the preset, which is the magic this convention exists to prevent: **nobody should ever wonder where a plugin they did not write came from.**

**Why.** The difference between a tool that displays components and a tool that is useful on the first command is a props table, an edit panel and the project's tokens. All three are derived from what the project already contains, so none of them asks the user for anything.

**What it makes mandatory rather than nice.** A default plugin must be **invisible when it has nothing to say**. No empty section in the sidebar, no « no tokens found » message. That is the `inapplicable` rule of the entry above, and it stops being a comfort here: these three run for people who never asked for them.

**A tension to hold rather than hide.** The README promises that nothing you have not installed is ever loaded. Three defaults do not contradict the sentence, they are installed, but they make it less striking. The counterweight is DCJ-193: each plugin's weight shown in the status bar makes the claim checkable instead of rhetorical.

**What would reopen it.** A preset plugin that costs enough at start-up to be felt, or one that turns out to be wrong often enough that switching it off becomes the normal move.

---

## The manifest is published; the Storybook format is an export, never ours

_2026-08-21_

**Decided.** The manifest format is published, documented and versioned. It is what we ask other tools to read.

Separately, and never confused with it, `crypte build` can also write an `index.json` in Storybook's shape and serve an `iframe.html?id=` with the same identifier convention. That is **an export labelled as compatibility**, not the format of Crypte. If Storybook breaks its format, we break an export, not an identity.

**Rejected.** Keeping the manifest internal, which would leave « our source of truth is computed » unverifiable by anyone. And presenting the Storybook shape as a supported format of ours, which would tie a contract to somebody else's release notes.

**Why publish.** zeroheight, Supernova and Knapsack all read Storybook's `index.json`. A public format is what lets the question be turned around: not « Crypte against zeroheight », which is meaningless since they are not the same product, but « why your documentation tool can read a Crypte ». That turns three competitors into channels.

**Why the export waits.** The rule « only cover what real use has shown » **cannot decide this one**: nobody can ask for the compatibility because nobody uses Crypte. It is the only case in the project where the rule is silent rather than binding, which is why it is written down as a known lever with a trigger instead of being built. The trigger: the first user who already runs zeroheight, Supernova or Knapsack. Tracked in DCJ-241.

**What it costs.** A public format is a contract that does not get broken, so `MANIFEST_VERSION` stops being an internal number. And the licence of the format has to be chosen when it is published, not two years later: the Sentry precedent is that a compatible reimplementation does appear, GlitchTip and Bugsink both exist, and that the defence is being better than free rather than being closed.

**What would reopen it.** A consumer that reimplements the producer rather than the reader, which is the one case where an open format costs more than it brings.

---

## MCP for agents, HTTP or the GitHub API for the plugin

_2026-08-21_

**Decided.** The same data sits behind two doors. Agents get MCP: a local stdio server that reads the manifest, roughly a hundred lines, no network and nothing to host. The Figma plugin gets HTTP and the GitHub API. **MCP is never the transport between the plugin and `serve`.**

**Rejected.** One MCP endpoint serving both, which is the shape that looks tidiest on a diagram.

**Why.** MCP is designed for a model calling tools, not as an application-to-application protocol. Proof by example: figma-console-mcp exposes MCP to agents and its own Figma plugin talks to its server over WebSocket.

**Why the local server is free on purpose.** It is a distribution channel, not a feature: an agent that knows Crypte recommends it, and that costs less than a comparison page. It is also the differentiator made concrete, since a manifest derived from the source cannot go stale the way hand-written context does. For scale, zeroheight caps its hosted MCP at 500 calls a month on Free and Starter; a local server has neither a quota nor a bill.

**The boundary, stated rather than hidden.** A local manifest serves neither a designer in Figma nor a product manager in Slack. Those need a remote endpoint, so a server, so `serve`, so later. The boundary is comfortable: the agent writing the code is the one that needs the most exact context.

**What would reopen it.** MCP growing a transport story for application-to-application use, or a remote endpoint arriving for other reasons and making a second protocol the more expensive option.

---

## Nobody has a Crypte account except the person who paid

_2026-08-21_

**Decided.** `serve` never asks a Crypte database who a designer is. **GitHub is the authentication**, through the device flow, the same one the Figma plugin uses. Identity is the GitHub account, authorisation is write access to the configured repository, and the repository's collaborator list is the team.

Seats are counted without identities. `serve` generates a random salt at install and never sends it; on a new account's first write it sends the salted hash of the numeric id and nothing else; the service answers with a signed seat token valid thirty-five days.

Licence validation is online and mandatory, and **degrades instead of stopping**: on failure `serve` falls back to single-user mode. An expired date is non-payment and degrades immediately with no grace; a failed check on a still-valid licence is an incident, the buffer runs and the user sees nothing. **The buffer never covers non-payment, only unavailability.**

**Rejected.** Accounts for the clients' designers, which would mean holding the identity of other companies' employees, becoming a critical point of failure in their work, and a GDPR scope that explodes. A local-only seat registry, which a script that deletes it defeats in seconds. And « signed key offline, never block », which was asserted as the industry norm and **was not**: Sentry sells nothing at that point at all, GitLab had exactly that model and abandoned it on 7 July 2022 for cloud activation codes with daily sync, and Metabase disables the paid features when `token-check.metabase.com` cannot be reached.

**Why the salt is the mechanism and not a detail.** The space of GitHub numeric ids is far too small for an unsalted hash to be irreversible. And the id **is** an identity: `GET /user/{id}` returns the login, the name and the avatar with no authentication. Public accessibility does not make it less personal data, because the GDPR governs the processing and not the difficulty of obtaining it.

**What counting has to be.** Not unforgeable, **observable**. The distinction decides everything, because the second one is free: deleting the local registry stops helping once rebuilding it means asking for tokens again and meeting the counter.

**Three Metabase bugs avoided by construction.** Validation never sits in a request path, or an expired token becomes a denial of service against your own endpoint. Backoff is exponential and capped, or a thousand clients failing at once finish off the endpoint as it tries to come back. Log transitions, not attempts.

**What would reopen it.** A client that cannot reach the internet at all, which GitLab handles as a commercially approved exception rather than a product mode, and which we would handle the same way.

---

## Story generation reads calls, not signatures

_2026-08-21_

**Decided.** The story-generation skill reads **where a component is called in the application**, not its type signature. `crypte check` already lists components with no story; the agent starts from that list, looks at the real call sites, and proposes the cases it finds. The human keeps some, drops others, and above all **names** them.

**Rejected.** Enumerating prop combinations, which yields Knapsack's output with one more step and a folder of stories nobody chose.

**Why.** This is the substance of the disagreement with Knapsack, whose thesis is that writing stories by hand is wasted work and the tool should read the component and generate demos and controls itself.

**Inference gives the surface, a story gives the case.** Inference knows `ProgressLoader` has a `progress` prop between 0 and 100. It will never know that 30 deserves to exist, that it is called « Étape 2 », and that it is worth a baseline. Their position holds for a button, where prop combinations exhaust the cases. It falls apart the moment a component has a lifecycle.

The name is the one thing no inference produces, and it is also what makes a story readable six months later.

**Why it is a shipping decision and not just an argument.** A skill versioned in the repository, that any Claude Code user runs on their own project, costs less than a comparison page and convinces better. Tracked in DCJ-238.

**What would reopen it.** A component library where call sites turn out to be less informative than the type surface, which would most likely mean the components are pure presentation and have no lifecycle to describe.

---

## The Figma reference state lives in the DTCG file's `$extensions`

_2026-08-21_

**Decided.** Figma variable ids are kept in the `$extensions` of the DTCG file itself. A token carrying an id that no longer exists in Figma was deleted on the design side; a token with no id is new on the code side.

**Rejected.** A separate reference file committed next to the manifest, which was the first idea.

**Why two states are not enough.** One-way, code to Figma, needs two. As soon as it is bidirectional a variable present in Figma and absent from the code has two possible histories: the designer just added it, or the developer just removed it. Seen head-on the two situations are identical and they call for opposite actions. Carrying the id makes the distinction fall out on its own, with no third file to maintain, commit and reconcile. The mechanism is figma-console-mcp's, and it is MIT.

**What comes with it.** The link from a Figma file to a repository lives in `figma.root.setPluginData`, so the whole team inherits the same one and the file is explicitly the design system file of that repository; `figma.clientStorage` would be per user and per machine, and two people could point at two repositories without knowing. The access token lives in `clientStorage`, per user. **The link is shared, the identity is not.**

**What would reopen it.** A DTCG consumer that rejects unknown `$extensions`, which the specification allows for but nothing observed does.

---

## A panel with nothing to say says `inapplicable`, and why

_2026-08-21_

**Decided.** One state, two spellings, and which one rules where. The identifier is **`inapplicable`**: that is what code carries, what `UIContribution` will name when it is written, and what the Figma frame state is called. French prose says **« sans objet »**, in `placement-ui.md` and `pistes-shell.md` only, the way the rest of those notes are written. Neither is a synonym to be aligned onto the other: prose reads, identifiers are typed. A third word invented at the contract is what this entry exists to prevent.

**The state is one value with two branches, per render.** Either a body, or `inapplicable` with its reason. Never both, never a reason alone. A boolean plus an optional reason would let both illegal forms be written, which is the defect `StoriesRead` already cost us. And per render, not declared once: `a11y` has no violation on one story and several on the next, so a state declared alongside the contribution zones could not express it.

**Scope of what we turn down.** « silence » as the name of *this state*, which the notes used until now: it reads as a panel saying nothing, the very behaviour the rule forbids. Nothing else. The repository uses « silence » and « en silence » some forty times for another notion, a defect that does not report itself, in `architecture.md`, `suivi.md`, `CLAUDE.md` and published comments. Those stay, and a review that renames them is reading this entry too widely.

**Where the identifier comes from.** The interface exploration in Figma, which named the frame state. The library itself is a lot 7 deliverable: its three pages are still to be created, so this entry is what carries the name *into* it, not a fact read back from it. Nothing in the repository can verify the Figma side today, which is why the name is written here rather than only there.

**What would reopen it.** A framework or a design language that already owns `inapplicable` for something else, a second surface where it does not read, or lot 7 finding a better name while the library is built, in which case both spellings move together.

---

## The shell ships prebuilt inside the CLI, the preview is built in the project

_2026-08-14_

**Decided.** The two pages `crypte dev` serves do not come from the same place.

The **shell** is built ahead of time and copied into `packages/cli/dist` when the CLI is packed. `@crypte/shell` stays private. 260 KB in the package, and the user installs nothing more.

The **preview** is compiled by the project's own Vite server, from an entry the CLI hands it. It has to be: it imports the adapter the user installed and the story modules of the project, so it belongs to their bundle and their framework.

**Rejected.** Publishing `@crypte/shell` as a package the CLI depends on, and shipping the shell's sources for the project's Vite to compile.

**Why.** A published shell would be a third package to version and to keep in step, and section 1.4 promises the user installs two. Shipping its sources is worse: the shell is a Vue application, so compiling it in the project would force Vue and its plugin onto a project that never asked for either.

The split is not a compromise, it follows from section 4.1. The preview imports story modules directly, in its own bundle, which is what lets a story pass a function or an element as a prop. Nothing of that can be prebuilt. The shell, on the other hand, knows no framework: it reads a manifest and talks over the channel.

**What it costs.** The shell has to be built before the CLI is packed, and nothing enforces that order today. A `crypte dev` shipped without its assets would fail at the worst moment, so the build order needs a control, not a convention.

**What would reopen it.** A shell that stops being framework-agnostic, or a user who needs to replace it. Neither is on the table: it is not a public API, and that is precisely why it can ship prebuilt.

---

## What the reader cannot read is said, at two levels, and never blocks

_2026-08-14_

**Decided.** When the CLI cannot read something in a story file, it says so in the shell, at one of two levels, and it never stops the user from working.

**An error** when the story does not exist for Crypte: it is missing from the sidebar, so the message has to be visible without being looked for. **A warning** when the story is there and renders but its page is incomplete, typically a props table missing the names a spread carries.

**Rejected.** Refusing the file, which costs a whole catalogue for one story being written. Saying nothing, which is what makes a story vanish in silence. And a single level, which would either shout about an incomplete props table or hide a missing story.

**Why.** Measured: the documented format of section 2.1, imported fixtures included, reads with no reservation at all. A `plan: planPro` yields the `plan` prop and a `source` of `plan={planPro}`. So none of this touches a user who follows the guide.

Past that, three cases exist and only two of them are the user's doing. The format can be broken, which is an error. Some code is legitimate JavaScript this reader cannot follow without running the file, `props: { ...baseProps, title }` being the ordinary case, and section 1.3 encourages exactly that kind of sharing. And `stories: {}` is somebody's deliberate empty file.

**So the wording of the middle case matters more than the level.** It has to say that the tool cannot read it, never that the author got it wrong. A message that blames the user for a limitation of static analysis teaches them to ignore every message after it.

**What it costs.** The reason is attached to a file today. An error can stay that way, since there is no entry to hang it on. A warning has to travel per entry, which is one optional field in `StoryEntry`. Tracked in DCJ-217.

**What would reopen it.** A reader that runs the file, which would remove the middle case entirely and leave only errors. Nothing suggests going there: not running the file is what makes indexing fast and robust.

---

## A story file is written in the language of its project

_2026-08-14_

**Decided.** Four extensions are read: `.ts`, `.tsx`, `.js` and `.jsx`. A project without TypeScript writes its stories in JavaScript.

**Rejected.** Keeping the two TypeScript extensions and asking a JavaScript project to write TypeScript anyway.

**Why.** Section 1.1 named `.ts` and `.tsx` only, which contradicted the work of lot 3: the CLI reads `jsconfig.json` and resolves the aliases of a project that has no TypeScript at all. Telling that same project to write its stories in a language its editor and its build are not set up for undoes the point.

The test fixture is exactly that project, and writing the contradiction into it is what surfaced this.

It costs nothing to read. `parseSync` picks its language from the file name, so the four extensions are one array, and the two JavaScript ones are the cheaper parse.

**What would reopen it.** Nothing likely. Narrowing back would take away a language a project already writes.

---

## The story parser comes from Vite, with no new dependency

_2026-08-14_

**Decided.** The CLI parses story files with `parseSync`, re-exported by `vite`, which is Oxc's own parser. `vite` is already a declared dependency of `@crypte/cli`, so nothing is added.

**Rejected.** Adding `oxc-parser` directly, reaching for `rolldown` behind Vite's back, and using `@babel/parser`, which is installed but only as somebody else's transitive dependency.

**Why.** Measured, in this order.

`parseAst`, also exported by Vite, reads JavaScript only: it fails on `as const` and on a generic arrow in a `.tsx`. Story files are `.ts` and `.tsx`, so it is the wrong tool despite the familiar name.

`parseSync` takes the filename, so it picks the language from the extension. On a `.tsx` file holding JSX, a generic arrow and an `as const`, it reports zero errors.

It **returns** its errors instead of throwing. One broken story file must not stop a catalogue from being written, and a parser that throws would make that harder than it needs to be.

`rolldown` is not resolvable from `@crypte/cli` under pnpm, being a transitive dependency of Vite. Importing it would mean declaring it, which is one more version to keep in step with Vite's own.

**What would reopen it.** Vite dropping `parseSync` from its public exports, or the parser turning out to be slower than reading the files. Both would be measured before moving.

---

## The manifest is a build artefact, and a small fingerprint is committed

_2026-08-13_

**Decided.** `crypte` writes two files. The full manifest is generated on every build and ignored by Git. A reduced fingerprint sits next to it and **is** committed: per entry, the identifier, the component file and export, the status, the sorted list of prop names, and a hash of the rest.

**Rejected.** Committing the full manifest, and committing nothing at all.

**Why.** Three features need the history of a catalogue: the "what changed" screen, a component's timeline, and a stable anchor for comments. Git is already a history, so writing a second one would be work for nothing.

Committing the full manifest does not hold. Measured with `test/manifest-size.mjs`: 706 KB raw and 84 KB gzipped for 500 stories, so a hundred versions of such a project weigh 8.2 MB and five hundred weigh 41 MB. The file also changes on every build, including when nothing meaningful moved.

Committing nothing loses the three features, and leaves nothing to compare a build against.

The fingerprint measures 268 bytes per story, 131 KB raw for 500 stories, and it only changes when something meaningful does. One thing that counts as meaningful and arguably should not: reordering a props block changes `source`, so it changes the digest, though the story renders the same.

**These figures were measured twice more at lot 4 ter, and were wrong both times before.** First the script derived the prop list from the component's whole declared surface instead of what the story sets. Then it modelled a fingerprint nobody writes: props joined by commas, a decimal digest, and JSON with no indentation, where the producer writes an array, sixteen hexadecimal characters and two-space indentation.

So the gap between the two files is **5.4×**, not the 6.5× first published nor the 8.5× that followed. The decision holds, with less room than it claimed.

**How it stays true.** Like a lockfile: the build writes it, and continuous integration fails when the committed one does not match, with a message saying what to run. Anything that depends on a person remembering ends up not being done.

**What would reopen it.** A project whose fingerprint changes on every build anyway, which would mean the reduced form keeps something it should not. Or a manifest small enough for the raw file to be committed without noise, which the measurements do not suggest.

---

## A line-comment change to published code needs no version note

_2026-08-13_

**Decided.** `require-changeset` reads the patch of each published file. When every changed line is a `//` comment or blank, the file does not ask for a note. A block comment still asks for one.

**Rejected.** Writing a note for such a change, dropping the file from the criterion, and treating every comment alike.

**Why.** The control asked for a note the first time it ran for real, on two comments where a documentation path had moved. A note would have added a changelog line that says nothing, which is what the `/changeset` skill exists to prevent. Dropping the file from the criterion would have lost the real case, where the code itself changes.

The split between the two kinds of comment is measured, not assumed. A `//` comment is stripped from the published `.d.ts`. A `/** */` block placed on an exported type is emitted into it, so it does reach the user and it does deserve a note.

A file with no patch still asks for a note. The API stops sending patches past a certain size, and blocking is the safe direction.

**What would reopen it.** A build that stops emitting declarations from source, or one that starts keeping line comments in them. Both would move the line between what ships and what does not.

---

## Public text is written in English

_2026-08-13_

**Decided.** Everything a user or a contributor reads goes to English: `README.md`, `CONTRIBUTING.md`, the contracts, the user guide, this file, the error messages of the CLI, and the comments in published source.

Everything on that list has moved, and `test/published-english.test.mjs` now refuses an accented character in `packages/*/src` outside a short backquoted example. What is left in French is the design notes, on purpose, the test names, tracked in DCJ-210, and whatever French carries no accent, which no check can see.

Notes written for the maintainer stay in French: `architecture.md`, `suivi.md`, `arborescence.md`, the planning documents, `CLAUDE.md`, and the skills under `.claude/`.

**Rejected.** Two options. Translating the whole repository, and keeping everything in French.

**Why.** Crypte is a public tool, and French text leaves out most of its readers. Agent instructions have no such audience: one person and one agent read them, and they carry rules that cost many review rounds to learn. Translating those rules loosely would lose more than it gains.

Test names are a third case, tracked in DCJ-210. There are 183 of them. They were quoted by `test/mutations.json`, which made renaming one a two-file operation; the catalogue is gone, so a rename is now a rename.

**What would reopen it.** An outside contributor. Published source points at `architecture.md` twice today, and the tests of the packages eight more times: English code that sends its reader to a French document does not hold for long.

---

## Documentation is split by audience, not by language

_2026-08-13_

**Decided.** `docs/` holds what a user or a contributor reads, in English. `docs/internal/` holds maintainer notes, in French. The move itself is DCJ-207.

**Rejected.** `docs/fr/`.

**Why.** By convention, `fr/` holds the French translation of the English documentation. There is no English version of these files, so a reader would look for `docs/internal/architecture.md` and never find it.

A split by language would also be incomplete. `CLAUDE.md` and `.claude/skills/` cannot move, because the tooling reads them at a fixed place, so French would sit both at the root and under `docs/fr/`.

The real difference is who reads a document. The language follows from that.

**What would reopen it.** A genuine translation of one document into a second language. Then `fr/` means what it usually means, and both rules can live side by side.

## Type tests guard inference, not what `vp check` already catches

**What we do.** One vitest project, `types`, runs the compiler over `*.test-d.ts` with a dedicated program, `tsconfig.types.json`. It guards the inference the published React package promises: `PropsOf`, `defineStories`, `story`.

**What we rule out.** Adding type tests for the three guarantees the retired mutation catalogue carried (`TS2339` on `channel.ts`, `TS2322` on `manifest.ts`, `TS2578` on `story.ts`). Measured: weakening `Wrap` and `Manifest.version` already fails `vp check`, which runs in CI. Restating them in `expectTypeOf` would evaluate the same compiler twice for the same verdict, which is the duplication removed one lot earlier.

**Why.** `vp check` sees a type error; nothing asks it that a type **is** what we promise. Measured: `PropsOf<C>` degraded from `infer P` to `any` left `vp check` and all 480 cases green, and that inference is what every story file's autocompletion depends on.

**What it cost.** 0.6 s on the whole suite, 1.1 s for the project alone. The cost was never the question.

**What would reopen it.** A type guarantee that `vp check` cannot express, or a second package growing an inference surface of its own. The project is already there, so the marginal cost is one file.

## The adapter nests the wrappers, the core flattens them

**What we do.** `wrapsOf` in `@crypte/core/preview` turns the two `wrap` declarations of section 2.5 into one ordered list, outermost first. `Adapter.mount` takes it as an optional fourth argument, and the React adapter nests it with one `createElement` per entry.

**What we rule out.** Flattening in each adapter, which would drift the day one of them learns something the other does not, exactly as `propsOfStory` already argues. And nesting in the core, which cannot: composing components is the framework's business.

**Why the fourth argument is optional.** An adapter written against the previous shape keeps compiling, and a story with no wrapper mounts exactly as before, with no extra element in the tree.

**What the browser proved.** A relative import in `crypte.config.ts` could not travel into the generated entry: the entry is a virtual module, so `./src/components/Frame` resolved against its own path and failed. Config imports are now rewritten root-absolute, like story imports already were, and one that escapes the project is refused by name. This defect predates the lot: an adapter imported relatively would have failed the same way.

**What would reopen it.** A framework whose composition is not a tree of components, where an ordered list is the wrong shape to hand over.

## The React plugin stays the project's business

**What we do.** Nothing. `@crypte/react` ships the adapter and the story helpers, no Vite plugin, and the CLI adds none. A project that wants `@vitejs/plugin-react` declares it in `vite.plugins`, as `apps/demo` does.

**What the browser proved.** The demonstration, stripped of both plugin imports and of its whole `vite` block, renders the story and its two wrappers with an empty console. Vite transforms the JSX by oxc, so the plugin is not needed to render. `packages/cli/test/plugin.test.ts` holds that measurement.

**What we rule out.** A `@crypte/react/vite` entry, which would ship a plugin nothing needs. And injecting the plugin when `adapter.name` is `react`, which is the package name guessed from the adapter that `dev.test.ts` already refuses: a wrapped adapter breaks the guess.

**Why the plugin buys so little here.** What it adds over oxc is Fast Refresh, and the preview does not use it: the shell is a prebuilt bundle with no HMR client, so a story that changes reloads the whole iframe. Measured at 43 ms for a configuration restart.

**Why the demonstration keeps it anyway.** React Compiler runs on Babel, so it needs the plugin. It is active on the target project, which is the risk `DCJ-170` asked to lift, and it is lifted by a project-supplied plugin rather than by one of ours.

**What would reopen it.** A framework whose adapter cannot render without a transform of its own, or Fast Refresh becoming reachable from the preview.
