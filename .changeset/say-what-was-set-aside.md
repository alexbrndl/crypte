---
'@crypte/cli': patch
'@crypte/core': patch
---

The shell says what the catalogue could not read.

A story file is read without being run, so what cannot be read without running it is set aside. Until now only the terminal said so, which is not where somebody looks for a story they cannot find: a file whose story key is computed lost that story silently, and a props table with a spread in it presented itself as complete.

The manifest carries both halves. `Manifest.skipped` names a file, with the reason, and the shell counts what the file did give by matching it against the entries: "1 story lue, il en manque" rather than a flat "ignored", which would be false of a file that gave three stories out of four. `StoryEntry.partial` names one entry whose record is incomplete, quoting what the file wrote, since the missing prop names are precisely what cannot be read.

Both fields are optional, so a manifest written before them stays valid and its version does not move. Neither is ever fatal: a file being written must not cost the catalogue.

Six losses were silent and are now said: a spread in the definition deciding the shared props block or `meta`, what a props block itself could not give up, a props block that is a reference rather than written inline, and a `meta` or `options` holding a value this reader cannot read. The last two took the status out of the manifest and out of the fingerprint without a word.

What gets reported is what meant to be a story. A file naming `defineStories` is one even when the call leaves by a named export, so it is reported rather than lost. A file whose default export is not a component is a story an edit broke, so it is reported too. A wrapper, a helper, a barrel or a type file posed next to the stories stays silent, since a permanent line above the preview for one of those would teach the reader to ignore the banner.

And a file that produced stories and produces none any more says so, which the reader alone cannot know: it judges one file at a time, and a story edited into a component is indistinguishable from a helper.
