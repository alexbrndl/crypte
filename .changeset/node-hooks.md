---
'@crypte/core': minor
'@crypte/cli': minor
---

A plugin can contribute entries to the manifest.

`CryptePlugin` is a real type in the protocol now, where it was `unknown` in the CLI's config. `@crypte/cli` re-exports it rather than declaring its own: the contract spans three surfaces, so it does not belong to one consumer.

`NodeHooks` carries one hook, `entries`, because one use demands it. It takes a context holding the project root and returns entries. Stories are not among them: they come from story files, and a plugin injecting one would bypass discovery.

**Hooks are synchronous, and they run after the stories in the order `plugins` declares.** No `order` field, which every plugin would set to zero. Being last means a contribution landing on an identifier a story already owns is the one that gives way.

**Nothing a plugin does is fatal, and nothing is silent.** A hook that throws, returns something other than entries, hands over an entry that is not one, lands on a taken identifier, or produces a value JSON would rewrite has that contribution refused, and `crypte dev` prints which plugin it came from and why. A broken plugin costs a panel, never the server.

**The shape of every entry is checked at run time, not only in the types.** `ContributedEntry` holds while a plugin is compiled, and a plugin is installed compiled: nothing in a published package stops it from handing over `type: 'story'`, which would enter the manifest and the committed fingerprint. `CONTRIBUTABLE` is that same set at run time.

Section 4.5 stops being free here: everything else the CLI writes is read from source text and serialisable by construction, so a contributed entry is the first input it checks rather than trusts. Anything JSON would not give back as it was is refused, named and located: a function, a `Date`, `NaN`, an infinity, an `undefined` value, a genuine cycle. Two references to one object are not a cycle, and are kept.

`UIContribution` and `PreviewHooks` stay opaque. Neither has a caller yet.
