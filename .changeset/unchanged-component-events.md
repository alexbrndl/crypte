---
'@crypte/cli': patch
---

`crypte dev` no longer rebuilds the catalogue when a component file reports a change that left its content as it was, as macOS can report on a file nothing wrote to.
