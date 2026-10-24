---
'@crypte/core': patch
'@crypte/cli': patch
---

A wrapper can be turned off from the shell: the stories panels list the story's wrappers, and unticking one renders the story without it, which shows the context a component depends on. `rendered` names the wrappers in `wraps`, and `render` takes the ranks to leave out in `muted`; no adapter changes.
