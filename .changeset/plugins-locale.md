---
'@crypte/core': patch
'@crypte/cli': patch
'@crypte/controls': patch
'@crypte/a11y': patch
---

The shell passes its language to the plugins: panels and view parts receive `locale`, `en` or `fr`, and a view's `label` may be one per language. `controls` and `a11y` draw their panels in French.
