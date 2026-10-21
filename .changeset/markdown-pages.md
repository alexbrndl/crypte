---
'@crypte/core': minor
'@crypte/cli': minor
---

Markdown files in the story folder become pages, a third nature of manifest entry. `ManifestEntry` is now `StoryEntry | TokensEntry | PageEntry`.

`Badge.md` next to `Badge.tsx` shows on that component's page; any other `.md` is a general page in the tree, placed by its path. The title is the first `# heading`, otherwise the file name. Raw HTML in a page shows as text, and only absolute http, https and mailto links are kept. A plugin cannot contribute a page.
