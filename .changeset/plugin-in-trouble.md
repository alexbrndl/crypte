---
'@crypte/core': patch
'@crypte/cli': patch
'@crypte/a11y': patch
---

The preview no longer waits for plugin modules before the first story: a module attaches when it arrives, and one that never does costs nothing. Panels receive `failed`, why the story on display could not be rendered, and `@crypte/a11y` folds on it instead of waiting. A preview hook exported by name rather than in the default export is refused with its reason.
