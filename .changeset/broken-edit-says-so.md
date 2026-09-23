---
'@crypte/cli': patch
---

A story that renders, then breaks while the dev server runs, now shows its error in the shell. It used to keep showing the version from before the edit, marked as rendered, when the file threw at load or imported a module that does not exist.
