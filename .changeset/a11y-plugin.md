---
'@crypte/a11y': patch
'@crypte/cli': patch
---

Adds `@crypte/a11y`, which analyses each render of a story with axe-core and lists its violations in a panel, by impact, with their rule and the selectors at fault. A panel can now unfold on the story on display by emitting `inapplicable` with `null`.
