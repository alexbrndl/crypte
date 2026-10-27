---
'@crypte/core': patch
'@crypte/cli': patch
'@crypte/source': patch
'@crypte/actions': patch
'@crypte/a11y': patch
---

A plugin panel puts its buttons in its header, beside "Reset all": `PanelProps.actions` is that slot's element, which a `<Teleport>` reaches. `source`, `actions` and `a11y` move theirs there.
