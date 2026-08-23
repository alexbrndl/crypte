---
'@crypte/core': minor
'@crypte/cli': minor
---

The manifest carries a second nature of entry, `tokens`.

`ManifestEntry` is now `StoryEntry | TokensEntry` instead of an alias for the first. One tokens entry holds a family rather than a single token: `path` and `name` place it in the tree the way a story's do, and `tokens` is keyed by token name.

Every token is read per theme, and `themes` is required, so a project with one theme holds one key rather than a second shape existing. `value` is always the resolved literal and `alias` is the chain that led to it, so drawing a swatch never depends on resolving anything.

No file format is part of this: CSS variables, DTCG and Tailwind belong to `@crypte/tokens`. The core carries the shape, a plugin carries the reading, the same split as props and `@crypte/docs`.

`MANIFEST_VERSION` stays at `1`. `"tokens"` was already a reserved value of a `type` field, which is what the reserve was for, and nothing required moved on `StoryEntry`.

Readers of a manifest now narrow on `type` before reading a story's fields, and the shell shows the natures it understands rather than everything the file holds. Nothing changes for a project whose manifest holds only stories, which is every project today.
