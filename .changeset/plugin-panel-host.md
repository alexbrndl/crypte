---
'@crypte/cli': minor
---

The shell mounts each plugin panel in a frame, in configuration order: the panel receives the story on display as `entry`, folds to one line when it emits `inapplicable` with a reason, and stays closed across reloads when closed. A plugin with a browser surface now needs a `name` no earlier plugin has.
