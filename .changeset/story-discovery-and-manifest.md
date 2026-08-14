---
'@crypte/cli': minor
'@crypte/core': minor
---

Crypte discovers stories and writes a manifest.

The CLI walks the story folder, reads each file without running it, and writes `.crypte/manifest.json`. It reads four extensions, `.ts`, `.tsx`, `.js` and `.jsx`, so a project with no TypeScript writes its stories the way it writes its components.

Each story yields the sidebar path, its stable identifier, the file its component lives in, and the call code rebuilt from the text the author wrote. The component is resolved through the project's own path aliases, so `@/components/Badge` is written down as `src/components/Badge.jsx`. A file that fails to parse is reported and skipped, never fatal. Two stories that land on the same identifier stop the build and are named.

`StoryEntry` carries a new required field, `props`: the prop names the story passes to the component, from the shared block and its own, sorted. `MANIFEST_VERSION` stays at `1`, because no manifest has ever been written: no command calls the producer, and nothing is published. From the first release that writes one, a required field means a new version.
