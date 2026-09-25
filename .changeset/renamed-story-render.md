---
'@crypte/cli': patch
---

A story renamed during `crypte dev` renders its own props instead of the base props, a story missing from its loaded module is reported as an error rather than rendered, and the shell drops the error of a story whose file was deleted.
