---
'@crypte/cli': patch
---

A component that fails to load, from a syntax error or a missing import, is now named in the shell with its file and line, as Vite reports it, instead of "Failed to fetch dynamically imported module" on the story file.
